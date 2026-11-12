begin;
create table public.access_security_controls (
  scope text not null check (scope in ('ip','browser')),
  subject_hash text not null,
  active boolean not null default true,
  expires_at timestamptz,
  request_id uuid not null,
  primary key(scope,subject_hash)
);
create table public.access_security_events (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  actor_id uuid not null,
  action text not null,
  reason text not null check (length(reason) between 5 and 240),
  scope text,
  subject_hash text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.access_security_events(request_id,created_at desc);
create index on public.player_access_requests(device_hash);
create index on public.player_access_requests(ip_hash);
create index on public.player_access_requests(footprint_hash);
alter table public.access_security_controls enable row level security;
alter table public.access_security_events enable row level security;
revoke all on public.access_security_controls,public.access_security_events from anon,authenticated;
grant all on public.access_security_controls,public.access_security_events to service_role;
grant usage,select on sequence public.access_security_events_id_seq to service_role;
insert into public.access_security_controls(scope,subject_hash,active,request_id)
select 'ip',ip_hash,active,request_id from public.access_ip_blocks;

create function public.check_access_security(p_ip text,p_browser text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.access_security_controls c
    where c.active and (c.expires_at is null or c.expires_at>now())
    and ((c.scope='ip' and c.subject_hash=p_ip) or (c.scope='browser' and c.subject_hash=p_browser)));
$$;
create function public.guard_access_security() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if public.check_access_security(new.ip_hash,new.device_hash) then
    raise exception 'No se permiten nuevas solicitudes desde este navegador o red. Contactá a soporte.' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger guard_access_security before insert on public.player_access_requests
for each row execute function public.guard_access_security();

create function public.apply_access_security(p_request uuid,p_actor uuid,p_action text,p_reason text,p_minutes integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare r public.player_access_requests%rowtype; target_scope text; target_hash text; until_at timestamptz;
begin
  if p_reason is null or length(trim(p_reason)) not between 5 and 240 then raise exception 'Ingresá un motivo de 5 a 240 caracteres.'; end if;
  select * into r from public.player_access_requests where id=p_request for update;
  if not found then raise exception 'La solicitud ya no existe.'; end if;
  if p_action not in ('pause','browser','ip','review','exception','unblock_browser','unblock_ip') then raise exception 'Acción no válida.'; end if;
  if p_action in ('pause','browser','unblock_browser') then target_scope:='browser';target_hash:=r.device_hash;
  elsif p_action in ('ip','unblock_ip') then target_scope:='ip';target_hash:=r.ip_hash;
  end if;
  if target_scope is not null and target_hash is null then raise exception 'La solicitud no tiene una referencia registrada para este control.'; end if;
  if p_action='exception' and r.ip_hash is null then raise exception 'No hay una red registrada.'; end if;
  if p_action='pause' then
    if p_minutes is null or p_minutes<1 or p_minutes>43200 then raise exception 'Elegí entre 1 minuto y 30 días.'; end if;
    until_at:=now()+make_interval(mins=>p_minutes);
    if exists(select 1 from public.access_security_controls where scope=target_scope and subject_hash=target_hash and active and expires_at is null) then
      raise exception 'Este navegador tiene un bloqueo permanente. Retiralo antes de aplicar una pausa.';
    end if;
  end if;
  if target_scope is not null then
    insert into public.access_security_controls(scope,subject_hash,active,expires_at,request_id)
      values(target_scope,target_hash,p_action not in ('unblock_browser','unblock_ip'),until_at,p_request)
      on conflict(scope,subject_hash) do update set active=excluded.active,expires_at=excluded.expires_at,request_id=excluded.request_id;
  end if;
  insert into public.access_security_events(request_id,actor_id,action,reason,scope,subject_hash,expires_at)
    values(p_request,p_actor,p_action,trim(p_reason),coalesce(target_scope,case when p_action='exception' then 'ip' end),coalesce(target_hash,case when p_action='exception' then r.ip_hash end),until_at);
end;
$$;

create function public.read_access_security(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.player_access_requests%rowtype;
begin
  select * into r from public.player_access_requests where id=p_request;
  if not found then raise exception 'La solicitud ya no existe.'; end if;
  return jsonb_build_object(
    'can_ip',r.ip_hash is not null,'can_browser',r.device_hash is not null,
    'browser_info',left(coalesce(r.origin_user_agent,'Navegador no registrado'),180),
    'observed_at',r.created_at,
    'recent_requests',(select count(*) from public.player_access_requests x where x.device_hash=r.device_hash and x.created_at>now()-interval '24 hours'),
    'controls',coalesce((select jsonb_agg(jsonb_build_object('scope',c.scope,'expires_at',c.expires_at)) from public.access_security_controls c where c.active and (c.expires_at is null or c.expires_at>now()) and ((c.scope='ip' and c.subject_hash=r.ip_hash) or (c.scope='browser' and c.subject_hash=r.device_hash))),'[]'::jsonb),
    'related',coalesce((select jsonb_agg(t.item) from (select jsonb_build_object('username',x.username,'same_ip',x.ip_hash=r.ip_hash,'same_browser',x.device_hash=r.device_hash,'similar_footprint',x.footprint_hash=r.footprint_hash,'observed_at',x.created_at) item from public.player_access_requests x where x.id<>r.id and ((r.ip_hash is not null and x.ip_hash=r.ip_hash) or (r.device_hash is not null and x.device_hash=r.device_hash) or (r.footprint_hash is not null and x.footprint_hash=r.footprint_hash)) order by x.created_at desc limit 20)t),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(t.item) from (select jsonb_build_object('id',e.id,'action',e.action,'reason',e.reason,'created_at',e.created_at,'expires_at',e.expires_at,'actor',coalesce((select u.username from public.user_profiles u where u.user_id=e.actor_id),e.actor_id::text)) item from public.access_security_events e where e.request_id=r.id or (e.scope='ip' and e.subject_hash=r.ip_hash) or (e.scope='browser' and e.subject_hash=r.device_hash) order by e.created_at desc,e.id desc limit 30)t),'[]'::jsonb));
end;
$$;
revoke all on function public.check_access_security(text,text),public.guard_access_security(),public.apply_access_security(uuid,uuid,text,text,integer),public.read_access_security(uuid) from public,anon,authenticated;
grant execute on function public.check_access_security(text,text),public.apply_access_security(uuid,uuid,text,text,integer),public.read_access_security(uuid) to service_role;
commit;
