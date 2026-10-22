begin;

alter table public.app_settings
  add column if not exists allow_player_logout boolean not null default false;

create table public.player_access_requests (
  id uuid primary key default gen_random_uuid(),
  username text not null check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  referral_code text,
  referrer_user_id uuid references public.user_profiles(user_id) on delete set null,
  access_token_hash text not null unique check (access_token_hash ~ '^[a-f0-9]{64}$'),
  device_hash text not null check (device_hash ~ '^[a-f0-9]{64}$'),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  player_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index player_access_requests_status_created on public.player_access_requests(status, created_at desc);
create index player_access_requests_device_created on public.player_access_requests(device_hash, created_at desc);
create index player_access_requests_ip_created on public.player_access_requests(ip_hash, created_at desc) where ip_hash is not null;
create unique index player_access_requests_one_open_device on public.player_access_requests(device_hash) where status = 'pending';
create unique index player_access_requests_one_open_username on public.player_access_requests(lower(username)) where status = 'pending';

create table public.player_access_messages (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.player_access_requests(id) on delete cascade,
  sender text not null check (sender in ('player','admin')),
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index player_access_messages_thread_date on public.player_access_messages(request_id, created_at, id);

create view public.player_access_request_inbox with (security_invoker = true) as
select r.id,r.username,r.referral_code,r.status,r.player_user_id,r.created_at,r.updated_at,
  latest.sender as last_sender,latest.body as last_body,latest.created_at as last_message_at
from public.player_access_requests r
left join lateral (
  select m.sender,m.body,m.created_at from public.player_access_messages m
  where m.request_id=r.id order by m.created_at desc,m.id desc limit 1
) latest on true;

alter table public.player_access_requests enable row level security;
alter table public.player_access_messages enable row level security;
revoke all on public.player_access_requests, public.player_access_messages from public, anon, authenticated;
grant all on public.player_access_requests, public.player_access_messages to service_role;
grant usage, select on sequence public.player_access_messages_id_seq to service_role;
revoke all on public.player_access_request_inbox from public, anon, authenticated;
grant select on public.player_access_request_inbox to service_role;

create function public.finalize_player_access_request(
  p_request_id uuid, p_user_id uuid, p_admin_id uuid, p_referrer_id uuid, p_temporary_password text
) returns void
language plpgsql security definer set search_path = '' as $$
declare access_request public.player_access_requests%rowtype;
begin
  if length(p_temporary_password) < 8 or length(p_temporary_password) > 72 then
    raise exception 'Contraseña temporal no válida.' using errcode='22023';
  end if;
  select * into access_request from public.player_access_requests where id=p_request_id for update;
  if not found or access_request.status <> 'pending' then
    raise exception 'La solicitud ya fue procesada.' using errcode='40001';
  end if;
  if p_referrer_id is not null then
    insert into public.player_referrals(referred_user_id,referrer_user_id,created_by)
    values (p_user_id,p_referrer_id,p_admin_id);
  end if;
  insert into public.player_access_messages(request_id,sender,body)
  values (p_request_id,'admin',
    '¡Tu acceso está listo!' || chr(10) ||
    'Usuario: ' || access_request.username || chr(10) ||
    'Contraseña temporal: ' || p_temporary_password || chr(10) ||
    'Ingresá en gana777bet.com con estos datos.');
  update public.player_access_requests
    set status='approved',player_user_id=p_user_id,updated_at=now()
    where id=p_request_id;
end;
$$;
revoke all on function public.finalize_player_access_request(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.finalize_player_access_request(uuid,uuid,uuid,uuid,text) to service_role;

commit;
