begin;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.telegram_routes (
  route text primary key check (route in ('withdrawals', 'deposits_all', 'shifts', 'sac_1', 'sac_2', 'sac_3', 'sac_4', 'sac_5')),
  chat_id text check (chat_id ~ '^-?[0-9]{1,20}$'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint telegram_route_ready check (not enabled or chat_id is not null)
);
alter table public.telegram_routes
  add column if not exists chat_id text,
  add column if not exists enabled boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists telegram_routes_route_uidx on public.telegram_routes(route);
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.telegram_routes'::regclass and conname = 'telegram_route_ready') then
    alter table public.telegram_routes add constraint telegram_route_ready check (not enabled or chat_id is not null);
  end if;
end $$;
insert into public.telegram_routes(route) values
  ('withdrawals'), ('deposits_all'), ('shifts'),
  ('sac_1'), ('sac_2'), ('sac_3'), ('sac_4'), ('sac_5')
  on conflict (route) do nothing;
alter table public.telegram_routes enable row level security;
revoke all on public.telegram_routes from public, anon, authenticated;
grant select on public.telegram_routes to authenticated;
grant update(chat_id, enabled, updated_at) on public.telegram_routes to authenticated;
grant select on public.telegram_routes to service_role;
drop policy if exists telegram_routes_admin on public.telegram_routes;
create policy telegram_routes_admin on public.telegram_routes for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create table if not exists public.telegram_alerts (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  route text not null references public.telegram_routes(route),
  event_type text not null check (event_type in ('deposit', 'withdrawal', 'shift_start', 'shift_end')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'sending', 'failed', 'sent', 'skipped', 'dead')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  telegram_message_id bigint,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists telegram_alerts_ready_idx on public.telegram_alerts(next_attempt_at, created_at)
  where status in ('pending', 'failed', 'sending');
alter table public.telegram_alerts enable row level security;
revoke all on public.telegram_alerts from public, anon, authenticated;
grant select on public.telegram_alerts to authenticated;
grant select, insert, update on public.telegram_alerts to service_role;
drop policy if exists telegram_alerts_admin_read on public.telegram_alerts;
create policy telegram_alerts_admin_read on public.telegram_alerts for select to authenticated
  using (public.is_super_admin());

create or replace function public.enqueue_request_telegram_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_sac integer; v_phone integer; v_name text; v_payload jsonb;
begin
  if new.status <> 'pending' then return new; end if;
  select coalesce(nullif(p.username, ''), nullif(p.display_name, ''), 'Jugador')
    into v_name from public.user_profiles p where p.user_id = new.user_id;
  if new.kind = 'deposit' then
    select sp.sac_number, ba.phone_number into v_sac, v_phone
      from public.bank_accounts ba
      left join public.sac_phones sp on sp.phone_number = ba.phone_number
      where ba.id = new.bank_account_id;
    v_payload := jsonb_build_object('request_id', new.id, 'amount', new.amount,
      'user_name', coalesce(v_name, 'Jugador'), 'sac', v_sac, 'phone', v_phone);
    insert into public.telegram_alerts(event_key, route, event_type, payload)
      select 'request:' || new.id || ':' || r.route, r.route, 'deposit', v_payload
      from public.telegram_routes r
      where r.enabled and r.chat_id is not null
        and (r.route = 'deposits_all' or r.route = 'sac_' || v_sac::text)
      on conflict (event_key) do nothing;
  elsif new.kind = 'withdrawal' then
    v_payload := jsonb_build_object('request_id', new.id, 'amount', new.amount,
      'user_name', coalesce(v_name, 'Jugador'));
    insert into public.telegram_alerts(event_key, route, event_type, payload)
      select 'request:' || new.id || ':withdrawals', r.route, 'withdrawal', v_payload
      from public.telegram_routes r where r.route = 'withdrawals' and r.enabled and r.chat_id is not null
      on conflict (event_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists enqueue_request_telegram_alerts on public.requests;
create trigger enqueue_request_telegram_alerts after insert on public.requests
  for each row execute function public.enqueue_request_telegram_alerts();

create or replace function public.enqueue_shift_telegram_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.telegram_alerts(event_key, route, event_type, payload)
    select 'shift:' || new.id, r.route, 'shift_' || new.action,
      jsonb_build_object('shift_id', new.id, 'sac', new.sac_number,
        'operator_name', new.operator_name, 'phones', to_jsonb(new.phones))
    from public.telegram_routes r where r.route = 'shifts' and r.enabled and r.chat_id is not null
    on conflict (event_key) do nothing;
  -- El sistema anterior enviaba desde el navegador. El nuevo envío queda en la cola.
  update public.sac_shift_events set telegram_status = 'skipped' where id = new.id;
  return new;
end $$;
drop trigger if exists enqueue_shift_telegram_alert on public.sac_shift_events;
create trigger enqueue_shift_telegram_alert after insert on public.sac_shift_events
  for each row execute function public.enqueue_shift_telegram_alert();

create or replace function public.claim_telegram_alert_batch(p_limit integer default 10)
returns setof public.telegram_alerts
language plpgsql security definer set search_path = '' as $$
begin
  update public.telegram_alerts
    set status = 'dead', claimed_at = null, last_error = 'worker_timeout'
    where status = 'sending' and attempts >= 10 and claimed_at < now() - interval '5 minutes';
  return query
  with ready as (
    select a.id from public.telegram_alerts a
    where ((a.status in ('pending', 'failed') and a.next_attempt_at <= now())
      or (a.status = 'sending' and a.claimed_at < now() - interval '5 minutes'))
      and a.attempts < 10
    order by a.created_at, a.id limit least(greatest(p_limit, 1), 10)
    for update skip locked
  )
  update public.telegram_alerts a
    set status = 'sending', attempts = a.attempts + 1, claimed_at = now()
    from ready where a.id = ready.id returning a.*;
end $$;
revoke all on function public.claim_telegram_alert_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_telegram_alert_batch(integer) to service_role;

create or replace function public.retry_telegram_alert(p_alert_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Operación no permitida.' using errcode = '42501';
  end if;
  update public.telegram_alerts set status = 'pending', attempts = 0, claimed_at = null,
    next_attempt_at = now(), last_error = null
    where id = p_alert_id and status in ('failed', 'dead');
  return found;
end $$;
revoke all on function public.retry_telegram_alert(uuid) from public, anon, authenticated;
grant execute on function public.retry_telegram_alert(uuid) to authenticated;

create or replace function public.verify_telegram_job_key(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select length(coalesce(p_key, '')) > 40 and exists (
    select 1 from vault.decrypted_secrets
    where name = 'service_role_key' and decrypted_secret = p_key
  );
$$;
revoke all on function public.verify_telegram_job_key(text) from public, anon, authenticated;
grant execute on function public.verify_telegram_job_key(text) to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'gana777-telegram-alerts';
select cron.schedule('gana777-telegram-alerts', '* * * * *', $job$
  select net.http_post(
    url := config.url || '/functions/v1/send-telegram-alerts',
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
