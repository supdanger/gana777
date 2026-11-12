begin;
create table public.player_account_controls (
  user_id uuid primary key references auth.users(id),
  blocked boolean not null default true,
  revoked_before timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  reason text not null check(length(reason) between 5 and 240)
);
create table public.player_account_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  actor_id uuid not null,
  blocked boolean not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index on public.player_account_events(user_id,created_at desc);
alter table public.player_account_controls enable row level security;
alter table public.player_account_events enable row level security;
revoke all on public.player_account_controls,public.player_account_events from anon,authenticated;
grant all on public.player_account_controls,public.player_account_events to service_role;
grant usage,select on sequence public.player_account_events_id_seq to service_role;

create function public.account_access_allowed() returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.player_account_controls c where c.user_id=(select auth.uid())
    and (c.blocked or coalesce((auth.jwt()->>'iat')::bigint,0)<=floor(extract(epoch from c.revoked_before))));
$$;
create function public.account_request_guard() returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.account_access_allowed() then raise sqlstate 'PT403' using message='ACCOUNT_BLOCKED: Tu acceso fue suspendido. Contactá a soporte.'; end if;
end;
$$;
create function public.set_player_account_block(p_user uuid,p_actor uuid,p_blocked boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_user=p_actor or exists(select 1 from public.admin_users where user_id=p_user) or exists(select 1 from public.cashier_profiles where user_id=p_user) then
    raise exception 'Este control solo permite bloquear jugadores, no cuentas del personal.';
  end if;
  if not exists(select 1 from public.user_profiles where user_id=p_user) then raise exception 'Jugador no encontrado.'; end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 240 then raise exception 'Ingresá un motivo de 5 a 240 caracteres.'; end if;
  insert into public.player_account_controls(user_id,blocked,revoked_before,updated_by,reason)
    values(p_user,p_blocked,now(),p_actor,trim(p_reason))
    on conflict(user_id) do update set blocked=excluded.blocked,revoked_before=case when p_blocked then now() else public.player_account_controls.revoked_before end,updated_at=now(),updated_by=p_actor,reason=excluded.reason;
  if p_blocked then delete from auth.sessions where user_id=p_user; end if;
  insert into public.player_account_events(user_id,actor_id,blocked,reason) values(p_user,p_actor,p_blocked,trim(p_reason));
end;
$$;
revoke all on function public.account_access_allowed(),public.account_request_guard(),public.set_player_account_block(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.account_access_allowed(),public.account_request_guard() to anon,authenticated,service_role;
grant execute on function public.set_player_account_block(uuid,uuid,boolean,text) to service_role;

-- Restrictive policies also protect Storage/Realtime, which do not use the REST hook.
do $$ declare r record;
begin
  for r in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and c.relrowsecurity and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
  loop
    execute format('create policy account_access_guard on %I.%I as restrictive for all to authenticated using ((select public.account_access_allowed())) with check ((select public.account_access_allowed()))',r.nspname,r.relname);
  end loop;
end; $$;
-- Avoid replacing a hook configured outside this repository.
do $$ begin
  if exists(select 1 from pg_roles r cross join lateral unnest(r.rolconfig) cfg where r.rolname='authenticator' and cfg like 'pgrst.db_pre_request=%' and cfg<>'pgrst.db_pre_request=public.account_request_guard') then
    raise exception 'Ya existe un db_pre_request. Integrar account_request_guard antes de aplicar esta migración.';
  end if;
end; $$;
alter role authenticator set pgrst.db_pre_request='public.account_request_guard';
notify pgrst,'reload config';
commit;
