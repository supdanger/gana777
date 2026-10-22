begin;

-- La segunda solicitud desde una IP que ya tiene usuario queda marcada y no se puede aprobar.
alter table public.player_access_requests
  add column if not exists ip_blocked boolean not null default false,
  add column if not exists matched_request_id uuid references public.player_access_requests(id) on delete set null,
  add column if not exists matched_username text;

alter table public.player_access_requests
  drop constraint if exists player_access_requests_matched_username_check;
alter table public.player_access_requests
  add constraint player_access_requests_matched_username_check
  check (matched_username is null or matched_username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');

alter table public.player_access_requests
  drop constraint if exists player_access_requests_ip_blocked_check;
alter table public.player_access_requests
  add constraint player_access_requests_ip_blocked_check
  check (ip_blocked = false or matched_request_id is not null);

-- Las solicitudes que ya se abrieron dos veces con la misma IP quedan avisadas y no se pueden aprobar.
with matches as (
  select distinct on (request.id)
    request.id as request_id, other.id as matched_request_id, other.username as matched_username
  from public.player_access_requests as request
  join public.player_access_requests as other
    on other.ip_hash = request.ip_hash and other.id <> request.id
  where request.status = 'pending'
    and request.ip_hash is not null
    and request.ip_blocked = false
    and (
      (other.status = 'approved' and other.player_user_id is not null)
      or (other.status = 'pending' and (other.created_at < request.created_at or (other.created_at = request.created_at and other.id < request.id)))
    )
  order by request.id, (other.status = 'approved' and other.player_user_id is not null) desc,
    other.created_at asc, other.id asc
)
update public.player_access_requests as request
set ip_blocked = true,
    matched_request_id = match.matched_request_id,
    matched_username = match.matched_username
from matches as match
where request.id = match.request_id;

create or replace view public.player_access_request_inbox with (security_invoker = true) as
select r.id,r.username,r.referral_code,r.status,r.player_user_id,r.created_at,r.updated_at,
  latest.sender as last_sender,latest.body as last_body,latest.created_at as last_message_at,
  r.ip_blocked,r.matched_request_id,r.matched_username
from public.player_access_requests r
left join lateral (
  select m.sender,m.body,m.created_at from public.player_access_messages m
  where m.request_id=r.id order by m.created_at desc,m.id desc limit 1
) latest on true;

commit;
