begin;
-- These payloads intentionally remain readable to their owner after suspension:
-- they contain only a revocation timestamp, so Realtime can deliver a logout.
create table public.player_session_signals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revoked_at timestamptz not null default now()
);
alter table public.player_session_signals enable row level security;
revoke all on public.player_session_signals from public,anon,authenticated;
grant select on public.player_session_signals to authenticated;
grant all on public.player_session_signals to service_role;
create policy own_session_signal on public.player_session_signals for select to authenticated
  using(user_id=(select auth.uid()));
create function public.publish_session_revocation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='player_account_controls' then
    if not new.blocked then return new; end if;
    insert into public.player_session_signals(user_id,revoked_at) values(new.user_id,new.revoked_before)
      on conflict(user_id) do update set revoked_at=excluded.revoked_at;
  else
    insert into public.player_session_signals(user_id,revoked_at) values(new.user_id,new.revoked_at)
      on conflict(user_id) do update set revoked_at=excluded.revoked_at;
  end if;
  return new;
end;
$$;
revoke all on function public.publish_session_revocation() from public,anon,authenticated;
create trigger signal_account_revocation after insert or update on public.player_account_controls
  for each row execute function public.publish_session_revocation();
create trigger signal_forced_logout after insert or update on public.player_session_revocations
  for each row execute function public.publish_session_revocation();
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='player_session_signals') then
    alter publication supabase_realtime add table public.player_session_signals;
  end if;
end; $$;
create index access_security_events_subject_recent on public.access_security_events(scope,subject_hash,created_at desc);
-- One staff authorization RPC replaces separate access and permission RPCs.
create function public.authorize_staff_access(p_permission text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.account_request_guard();
  return public.has_admin_permission(p_permission);
end;
$$;
revoke all on function public.authorize_staff_access(text) from public,anon;
grant execute on function public.authorize_staff_access(text) to authenticated;
commit;
