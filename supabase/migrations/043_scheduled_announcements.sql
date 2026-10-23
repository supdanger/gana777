begin;

create table public.scheduled_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 100),
  body text not null check (length(btrim(body)) between 1 and 1000),
  weekdays smallint[] not null check (array_length(weekdays, 1) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  send_time time without time zone not null check (date_part('second', send_time) = 0),
  active boolean not null default true,
  deleted_at timestamptz,
  last_sent_on date,
  last_sent_count integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scheduled_announcements_active_time on public.scheduled_announcements(send_time) where active;
alter table public.scheduled_announcements enable row level security;
revoke all on public.scheduled_announcements from public, anon, authenticated;
grant select, insert, update, delete on public.scheduled_announcements to authenticated;
create policy scheduled_announcements_admin on public.scheduled_announcements
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

alter table public.user_notifications add column announcement_id uuid references public.scheduled_announcements(id);
alter table public.user_notifications add column scheduled_for date;
alter table public.user_notifications add column push_claimed_at timestamptz;
alter table public.user_notifications drop constraint user_notifications_kind_check;
alter table public.user_notifications add constraint user_notifications_kind_check
  check (kind in ('deposit_credited', 'withdrawal_paid', 'chat_message', 'announcement'));
alter table public.user_notifications drop constraint user_notifications_source_check;
alter table public.user_notifications add constraint user_notifications_source_check check (
  (kind = 'deposit_credited' and request_id is not null and part_number is null and message_id is null and announcement_id is null and scheduled_for is null) or
  (kind = 'withdrawal_paid' and request_id is not null and part_number is not null and message_id is null and announcement_id is null and scheduled_for is null) or
  (kind = 'chat_message' and request_id is null and part_number is null and message_id is not null and announcement_id is null and scheduled_for is null) or
  (kind = 'announcement' and request_id is null and part_number is null and message_id is null and announcement_id is not null and scheduled_for is not null)
);
create unique index user_notifications_announcement_once
  on public.user_notifications(announcement_id, user_id, scheduled_for) where kind = 'announcement';

create or replace function public.dispatch_scheduled_announcements() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  local_now timestamp := clock_timestamp() at time zone 'America/Asuncion';
  campaign public.scheduled_announcements%rowtype;
  delivered integer;
  total integer := 0;
begin
  for campaign in
    select * from public.scheduled_announcements
    where active and deleted_at is null and send_time = date_trunc('minute', local_now)::time
      and extract(isodow from local_now)::smallint = any(weekdays)
      and last_sent_on is distinct from local_now::date
    for update skip locked
  loop
    insert into public.user_notifications(user_id, kind, title, body, announcement_id, scheduled_for, push_sent_at)
      select p.user_id, 'announcement', campaign.title, campaign.body, campaign.id, local_now::date,
        case when exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id) then null else now() end
      from public.user_profiles p
      where not exists (select 1 from public.cashier_profiles c where c.user_id = p.user_id)
      on conflict (announcement_id, user_id, scheduled_for) where kind = 'announcement' do nothing;
    get diagnostics delivered = row_count;
    update public.scheduled_announcements
      set last_sent_on = local_now::date, last_sent_count = delivered, updated_at = now()
      where id = campaign.id;
    total := total + delivered;
  end loop;
  return total;
end $$;
revoke all on function public.dispatch_scheduled_announcements() from public, anon, authenticated;

create or replace function public.claim_announcement_push_batch(p_limit integer default 25)
returns table(id uuid, user_id uuid, title text, body text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with next_batch as (
    select n.id from public.user_notifications n
    where n.kind = 'announcement' and n.push_sent_at is null
      and (n.push_claimed_at is null or n.push_claimed_at < now() - interval '5 minutes')
    order by n.created_at, n.id limit least(greatest(p_limit, 1), 25)
    for update skip locked
  )
  update public.user_notifications n set push_claimed_at = now()
  from next_batch b where n.id = b.id
  returning n.id, n.user_id, n.title, n.body;
end $$;
revoke all on function public.claim_announcement_push_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_announcement_push_batch(integer) to service_role;

create extension if not exists pg_cron with schema extensions;
select cron.schedule('gana777-scheduled-announcements', '* * * * *', 'select public.dispatch_scheduled_announcements()');

-- El push usa los secretos project_url y service_role_key de Supabase Vault.
-- Sin ellos, el envío dentro del portal continúa y este trabajo no llama a la función.
create extension if not exists pg_net with schema extensions;
select cron.schedule('gana777-announcement-push', '* * * * *', $job$
  select net.http_post(
    url := config.url || '/functions/v1/send-announcement-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', config.secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) from (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) as url,
      (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1) as secret
  ) config where config.url is not null and config.secret is not null
$job$);

commit;
