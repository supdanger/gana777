begin;
create table public.withdrawal_rejections (
  request_id uuid primary key references public.requests(id),
  user_id uuid not null references auth.users(id),
  actor_id uuid not null references auth.users(id),
  reason text not null check(length(reason) between 5 and 240),
  minutes integer check(minutes in (15,120,360,720)),
  paused_until timestamptz,
  created_at timestamptz not null default now(),
  check((minutes is null)=(paused_until is null))
);
create index withdrawal_rejections_user_recent on public.withdrawal_rejections(user_id,created_at desc);
create index requests_withdrawal_recent on public.requests(user_id,created_at desc,id desc) where kind='withdrawal';
create table public.withdrawal_pauses (
  user_id uuid primary key references auth.users(id),
  paused_until timestamptz not null,
  request_id uuid not null references public.withdrawal_rejections(request_id),
  reason text not null
);
alter table public.withdrawal_rejections enable row level security;
alter table public.withdrawal_pauses enable row level security;
revoke all on public.withdrawal_rejections,public.withdrawal_pauses from public,anon,authenticated;
grant select on public.withdrawal_rejections,public.withdrawal_pauses to authenticated;
grant all on public.withdrawal_rejections,public.withdrawal_pauses to service_role;
create policy withdrawal_rejection_read on public.withdrawal_rejections for select to authenticated using(
  (select public.account_access_allowed()) and (user_id=(select auth.uid()) or public.has_admin_permission('withdrawal')));
create policy withdrawal_pause_read on public.withdrawal_pauses for select to authenticated using(
  (select public.account_access_allowed()) and (user_id=(select auth.uid()) or public.has_admin_permission('withdrawal')));

create function public.enforce_withdrawal_pause() returns trigger
language plpgsql security definer set search_path='' as $$
declare until_at timestamptz;
begin
  if new.kind<>'withdrawal' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  select paused_until into until_at from public.withdrawal_pauses where user_id=new.user_id;
  if until_at>now() then
    raise sqlstate 'PT423' using message='Tenés una pausa activa para solicitar retiros. Esperá a que termine la cuenta regresiva.';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_withdrawal_pause() from public,anon,authenticated;
create trigger enforce_withdrawal_pause before insert on public.requests for each row execute function public.enforce_withdrawal_pause();

create function public.reject_withdrawal_with_pause(p_request uuid,p_reason text,p_minutes integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.requests%rowtype; existing public.withdrawal_rejections%rowtype; until_at timestamptz; reused boolean:=false;
begin
  perform public.account_request_guard();
  if auth.uid() is null or not public.has_admin_permission('withdrawal') then raise exception 'No tenés permiso para rechazar retiros.' using errcode='42501'; end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 240 or p_reason !~ '[^[:space:]]' then raise exception 'Ingresá un motivo de 5 a 240 caracteres.'; end if;
  if p_minutes is not null and p_minutes not in (15,120,360,720) then raise exception 'Elegí 15 minutos, 2, 6 o 12 horas.'; end if;
  select * into r from public.requests where id=p_request for update;
  if not found or r.kind<>'withdrawal' then raise exception 'Retiro no encontrado.'; end if;
  select * into existing from public.withdrawal_rejections where request_id=p_request;
  if r.status='rejected' and existing.request_id is not null then
    reused:=true;
  else
    if r.status<>'pending' then raise exception 'El retiro ya no está pendiente.'; end if;
    if exists(select 1 from public.withdrawal_parts where request_id=p_request and paid_at is not null) then raise exception 'Este retiro ya tiene pagos realizados y no se puede rechazar.'; end if;
    perform pg_advisory_xact_lock(hashtextextended(r.user_id::text,0));
    if p_minutes is not null then until_at:=now()+make_interval(mins=>p_minutes); end if;
    update public.requests set status='rejected' where id=p_request;
    insert into public.withdrawal_rejections(request_id,user_id,actor_id,reason,minutes,paused_until)
      values(p_request,r.user_id,auth.uid(),trim(p_reason),p_minutes,until_at) returning * into existing;
    if until_at is not null then
      insert into public.withdrawal_pauses(user_id,paused_until,request_id,reason)
        values(r.user_id,until_at,p_request,trim(p_reason))
        on conflict(user_id) do update set paused_until=excluded.paused_until,request_id=excluded.request_id,reason=excluded.reason
        where excluded.paused_until>public.withdrawal_pauses.paused_until;
    end if;
  end if;
  return jsonb_build_object('id',r.id,'status','rejected','minutes',existing.minutes,'paused_until',existing.paused_until,'reason',existing.reason,'effective_paused_until',(select paused_until from public.withdrawal_pauses where user_id=r.user_id and paused_until>now()),'reused',reused);
end;
$$;
revoke all on function public.reject_withdrawal_with_pause(uuid,text,integer) from public,anon;
grant execute on function public.reject_withdrawal_with_pause(uuid,text,integer) to authenticated;

create function public.get_my_withdrawal_pause() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pause public.withdrawal_pauses%rowtype; rejection public.withdrawal_rejections%rowtype;
begin
  perform public.account_request_guard();
  if auth.uid() is null then raise exception 'Ingresá a tu cuenta.' using errcode='42501'; end if;
  select * into pause from public.withdrawal_pauses where user_id=auth.uid() and paused_until>now();
  select * into rejection from public.withdrawal_rejections where request_id=(select id from public.requests where user_id=auth.uid() and kind='withdrawal' order by created_at desc,id desc limit 1);
  return jsonb_build_object('server_now',now(),'paused_until',pause.paused_until,'reason',pause.reason,
    'last_rejection',case when rejection.request_id is not null then jsonb_build_object('reason',rejection.reason,'created_at',rejection.created_at) else null end);
end;
$$;
revoke all on function public.get_my_withdrawal_pause() from public,anon;
grant execute on function public.get_my_withdrawal_pause() to authenticated;
alter publication supabase_realtime add table public.withdrawal_pauses;
commit;
