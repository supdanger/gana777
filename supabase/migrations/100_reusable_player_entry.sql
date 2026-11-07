begin;
create table public.player_entry_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_attempt_at timestamptz
);
alter table public.player_entry_links enable row level security;
revoke all on public.player_entry_links from public, anon, authenticated;
grant all on public.player_entry_links to service_role;

-- Serializa los intentos de un mismo enlace antes de pedir una sesión a Auth.
create function public.claim_player_entry(p_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare entry public.player_entry_links;
begin
  select * into entry from public.player_entry_links where token_hash=p_hash for update;
  if not found or entry.revoked_at is not null or entry.expires_at <= clock_timestamp() then
    raise exception using errcode='P0001', message='entry_expired';
  end if;
  if entry.last_attempt_at > clock_timestamp()-interval '15 seconds' then
    raise exception using errcode='P0001', message='entry_busy';
  end if;
  if exists(select 1 from public.admin_users where user_id=entry.user_id) then
    raise exception using errcode='P0001', message='entry_expired';
  end if;
  update public.player_entry_links set last_attempt_at=clock_timestamp() where user_id=entry.user_id;
  return entry.user_id;
end $$;
revoke all on function public.claim_player_entry(text) from public,anon,authenticated;
grant execute on function public.claim_player_entry(text) to service_role;
commit;
