begin;

create table if not exists public.deposit_credits (
  request_id uuid primary key references public.requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  confirmed_by uuid not null references auth.users(id),
  credited_at timestamptz not null default now()
);
create index if not exists deposit_credits_user_id_idx on public.deposit_credits(user_id);
alter table public.deposit_credits enable row level security;
revoke all on public.deposit_credits from public, anon, authenticated;
grant select on public.deposit_credits to authenticated;
create policy deposit_credits_read on public.deposit_credits for select to authenticated
  using (user_id = auth.uid() or public.has_admin_permission('deposit'));

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null unique references public.requests(id) on delete cascade,
  kind text not null check (kind = 'deposit_credited'),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  push_sent_at timestamptz
);
create index if not exists user_notifications_user_created_idx on public.user_notifications(user_id, created_at desc);
alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from public, anon, authenticated;
grant select on public.user_notifications to authenticated;
create policy user_notifications_read on public.user_notifications for select to authenticated
  using (user_id = auth.uid());

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth_secret text not null,
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;

create or replace function public.confirm_deposit_credit(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.requests%rowtype;
  v_notification_id uuid;
  v_new boolean := false;
begin
  if not public.has_admin_permission('deposit') then
    raise exception 'No tenés permiso para acreditar cargas.' using errcode = '42501';
  end if;
  select * into v_request from public.requests where id = p_request_id for update;
  if not found or v_request.kind <> 'deposit' or v_request.status <> 'approved' then
    raise exception 'La carga debe estar aprobada antes de confirmar la acreditación.' using errcode = '22023';
  end if;
  insert into public.deposit_credits(request_id, user_id, confirmed_by)
    values (v_request.id, v_request.user_id, auth.uid())
    on conflict (request_id) do nothing;
  insert into public.user_notifications(user_id, request_id, kind, title, body)
    values (v_request.user_id, v_request.id, 'deposit_credited', '¡Tu carga fue acreditada!',
      'Ya acreditamos tu carga de ' || to_char(v_request.amount, 'FM999G999G999G990D00') || '. Entrá a Gana777 para verla.')
    on conflict (request_id) do nothing returning id into v_notification_id;
  v_new := v_notification_id is not null;
  if not v_new then
    select id into v_notification_id from public.user_notifications where request_id = v_request.id;
  end if;
  return jsonb_build_object('notification_id', v_notification_id, 'newly_credited', v_new);
end $$;
revoke all on function public.confirm_deposit_credit(uuid) from public, anon, authenticated;
grant execute on function public.confirm_deposit_credit(uuid) to authenticated;

create or replace function public.mark_my_notification_read(p_notification_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.user_notifications set read_at = coalesce(read_at, now())
    where id = p_notification_id and user_id = auth.uid();
end $$;
revoke all on function public.mark_my_notification_read(uuid) from public, anon, authenticated;
grant execute on function public.mark_my_notification_read(uuid) to authenticated;

create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_host text;
begin
  if auth.uid() is null or length(p_endpoint) > 2048 or length(p_p256dh) > 256 or length(p_auth) > 256
    or p_p256dh !~ '^[A-Za-z0-9_-]+$' or p_auth !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Suscripción inválida.' using errcode = '22023';
  end if;
  v_host := lower(substring(p_endpoint from '^https://([^/:?#]+)'));
  if v_host is null or v_host not in ('fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com')
    and v_host !~ '^[a-z0-9-]+[.]push[.]apple[.]com$' then
    raise exception 'Servidor de notificaciones no admitido.' using errcode = '22023';
  end if;
  insert into public.push_subscriptions(endpoint, user_id, p256dh, auth_secret)
    values (p_endpoint, auth.uid(), p_p256dh, p_auth)
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
      auth_secret = excluded.auth_secret, updated_at = now();
end $$;
revoke all on function public.register_push_subscription(text,text,text) from public, anon, authenticated;
grant execute on function public.register_push_subscription(text,text,text) to authenticated;

create or replace function public.unregister_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;
revoke all on function public.unregister_push_subscription(text) from public, anon, authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;

create or replace view public.request_summaries with (security_invoker = true) as
select r.id, r.user_id, coalesce(p.username, p.display_name, 'Usuario') as user_name, r.kind, r.amount, r.status, r.created_at,
  r.holder, r.cbu, r.alias, r.receipt_path,
  to_jsonb(r)->>'receipt_url' as receipt_url,
  (to_jsonb(r)->>'bonus_id')::uuid as bonus_id,
  coalesce((to_jsonb(r)->>'bonus_percent')::numeric, 0) as bonus_percent,
  coalesce(r.bonus_amount, 0) as bonus_amount,
  r.approved_at,
  dc.credited_at
from public.requests r
left join public.user_profiles p on p.user_id = r.user_id
left join public.deposit_credits dc on dc.request_id = r.id;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.user_notifications;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

commit;
