begin;

create table if not exists public.player_session_revocations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revoked_at timestamptz not null default now()
);
alter table public.player_session_revocations enable row level security;
revoke all on public.player_session_revocations from public, anon, authenticated;

create or replace function public.force_player_logout(target_user_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('users') then
    raise exception using errcode = '42501', message = 'No tenés permiso para cerrar sesiones de jugadores.';
  end if;
  if target_user_id is null or public.is_panel_user(target_user_id) then
    raise exception 'Jugador inválido.';
  end if;
  insert into public.player_session_revocations(user_id, revoked_at)
  values (target_user_id, now())
  on conflict (user_id) do update set revoked_at = excluded.revoked_at;
end;
$$;
revoke all on function public.force_player_logout(uuid) from public, anon;
grant execute on function public.force_player_logout(uuid) to authenticated;

create or replace function public.get_my_session_revoked_at()
returns timestamptz
language sql stable security definer set search_path = '' as $$
  select revoked_at from public.player_session_revocations where user_id = auth.uid();
$$;
revoke all on function public.get_my_session_revoked_at() from public, anon;
grant execute on function public.get_my_session_revoked_at() to authenticated;

commit;
