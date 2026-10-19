-- Recomendados: primera carga aprobada, dos premios independientes de $1.000.
-- La acreditación en la plataforma externa sigue siendo manual.
begin;

create table public.player_referrals (
  referred_user_id uuid primary key references public.user_profiles(user_id) on delete restrict,
  referrer_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint referral_no_self check (referred_user_id <> referrer_user_id)
);
create index player_referrals_referrer on public.player_referrals(referrer_user_id);

create table public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid not null references public.player_referrals(referred_user_id) on delete restrict,
  beneficiary_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  source_request_id uuid not null references public.requests(id) on delete restrict,
  beneficiary_role text not null check (beneficiary_role in ('referrer','referred')),
  amount numeric(14,2) not null default 1000 check (amount=1000),
  status text not null default 'pending' check (status in ('pending','reserved','credited')),
  created_at timestamptz not null default now(),
  reserved_at timestamptz,
  reserved_by uuid references auth.users(id) on delete restrict,
  credited_at timestamptz,
  credited_by uuid references auth.users(id) on delete set null,
  unique(referred_user_id,beneficiary_role),
  constraint referral_credit_state check (
    (status='pending' and reserved_at is null and reserved_by is null and credited_at is null and credited_by is null) or
    (status='reserved' and reserved_at is not null and reserved_by is not null and credited_at is null and credited_by is null) or
    (status='credited' and reserved_at is not null and reserved_by is not null and credited_at is not null)
  )
);
create index referral_rewards_beneficiary on public.referral_rewards(beneficiary_user_id,created_at desc);
create index referral_rewards_queue on public.referral_rewards(status,created_at,id);
create index referral_rewards_source on public.referral_rewards(source_request_id);

create table public.referral_reward_events (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.referral_rewards(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('reserved','released','credited')),
  created_at timestamptz not null default now()
);
alter table public.referral_reward_events enable row level security;
revoke all on public.referral_reward_events from public,anon,authenticated,service_role;
grant select on public.referral_reward_events to authenticated;
create policy referral_events_read on public.referral_reward_events for select to authenticated
  using (public.has_admin_permission('users') or public.has_admin_permission('bonuses'));

alter table public.player_referrals enable row level security;
alter table public.referral_rewards enable row level security;
revoke all on public.player_referrals,public.referral_rewards from public,anon,authenticated,service_role;
grant select on public.player_referrals,public.referral_rewards to authenticated;
grant select,insert on public.player_referrals to service_role;
grant select on public.referral_rewards to service_role;
create policy referrals_read on public.player_referrals for select to authenticated using (
  referred_user_id=auth.uid() or referrer_user_id=auth.uid()
  or public.has_admin_permission('users') or public.has_admin_permission('bonuses')
);
create policy referral_rewards_read on public.referral_rewards for select to authenticated using (
  beneficiary_user_id=auth.uid() or public.has_admin_permission('users')
  or public.has_admin_permission('bonuses') or public.has_admin_permission('deposit')
);

create function public.guard_player_referral() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode='22023',message='La recomendación registrada no se puede modificar.';
  end if;
  perform pg_advisory_xact_lock(777022);
  perform pg_advisory_xact_lock(hashtextextended(new.referred_user_id::text,22));
  if new.referred_user_id=new.referrer_user_id then
    raise exception using errcode='22023',message='Un jugador no puede recomendarse a sí mismo.';
  end if;
  if public.is_panel_user(new.referred_user_id) or public.is_panel_user(new.referrer_user_id) then
    raise exception using errcode='22023',message='El recomendador y el recomendado deben ser jugadores.';
  end if;
  if exists(select 1 from public.requests r where r.user_id=new.referred_user_id and r.kind='deposit' and r.status='approved') then
    raise exception using errcode='22023',message='La recomendación debe registrarse antes de la primera carga aprobada.';
  end if;
  -- También impide cadenas circulares si se importan relaciones por servidor.
  if exists(
    with recursive ancestors(user_id) as (
      select new.referrer_user_id
      union
      select r.referrer_user_id from public.player_referrals r join ancestors a on r.referred_user_id=a.user_id
    ) select 1 from ancestors where user_id=new.referred_user_id
  ) then raise exception using errcode='22023',message='La recomendación no puede formar una cadena circular.'; end if;
  new.created_at := now();
  return new;
end $$;
revoke all on function public.guard_player_referral() from public,anon,authenticated;
create trigger guard_player_referral before insert or update or delete on public.player_referrals
  for each row execute function public.guard_player_referral();

create function public.generate_referral_rewards() returns trigger
language plpgsql security definer set search_path = '' as $$
declare recommender uuid;
begin
  if new.kind <> 'deposit' or new.status <> 'approved' or old.status <> 'pending' then return new; end if;
  -- La aprobación y el alta de la relación comparten bloqueo por recomendado.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,22));
  select r.referrer_user_id into recommender from public.player_referrals r
    where r.referred_user_id=new.user_id for update;
  if not found then return new; end if;
  if public.is_panel_user(new.user_id) or public.is_panel_user(recommender) then return new; end if;
  if exists(select 1 from public.requests r where r.user_id=new.user_id and r.kind='deposit'
    and r.status='approved' and r.id<>new.id) then return new; end if;
  insert into public.referral_rewards(referred_user_id,beneficiary_user_id,source_request_id,beneficiary_role)
  values (new.user_id,recommender,new.id,'referrer'),(new.user_id,new.user_id,new.id,'referred')
  on conflict(referred_user_id,beneficiary_role) do nothing;
  return new;
end $$;
revoke all on function public.generate_referral_rewards() from public,anon,authenticated;
create trigger generate_referral_rewards after update of status on public.requests
  for each row when (new.kind='deposit' and old.status='pending' and new.status='approved')
  execute function public.generate_referral_rewards();

create function public.reserve_referral_reward(p_reward_id uuid)
returns setof public.referral_rewards
language plpgsql security definer set search_path = '' as $$
declare reward public.referral_rewards%rowtype;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or not (public.has_admin_permission('users') or public.has_admin_permission('bonuses')) then
    raise exception using errcode='42501',message='No tenés permiso para gestionar bonos de recomendación.';
  end if;
  select * into reward from public.referral_rewards where id=p_reward_id for update;
  if not found or reward.status='credited' then
    raise exception using errcode='22023',message='El bono ya fue acreditado o no existe.';
  end if;
  if reward.status='reserved' and reward.reserved_by<>auth.uid() then
    raise exception using errcode='22023',message='Otro operador está acreditando este bono.';
  end if;
  if reward.status='pending' then
    update public.referral_rewards set status='reserved',reserved_at=now(),reserved_by=auth.uid()
      where id=reward.id returning * into reward;
    insert into public.referral_reward_events(reward_id,actor_id,action) values(reward.id,auth.uid(),'reserved');
  end if;
  return next reward;
end $$;
revoke all on function public.reserve_referral_reward(uuid) from public,anon,authenticated;
grant execute on function public.reserve_referral_reward(uuid) to authenticated;

create function public.release_referral_reward(p_reward_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare reward public.referral_rewards%rowtype;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or not (public.has_admin_permission('users') or public.has_admin_permission('bonuses')) then
    raise exception using errcode='42501',message='No tenés permiso para gestionar bonos de recomendación.';
  end if;
  select * into reward from public.referral_rewards where id=p_reward_id for update;
  if not found or reward.status<>'reserved' or (reward.reserved_by<>auth.uid() and not public.is_super_admin()) then
    raise exception using errcode='22023',message='No se puede liberar esta reserva.';
  end if;
  update public.referral_rewards set status='pending',reserved_at=null,reserved_by=null where id=reward.id;
  insert into public.referral_reward_events(reward_id,actor_id,action) values(reward.id,auth.uid(),'released');
end $$;
revoke all on function public.release_referral_reward(uuid) from public,anon,authenticated;
grant execute on function public.release_referral_reward(uuid) to authenticated;

create function public.mark_referral_reward_credited(p_reward_id uuid)
returns setof public.referral_rewards
language plpgsql security definer set search_path = '' as $$
declare reward public.referral_rewards%rowtype;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or not (public.has_admin_permission('users') or public.has_admin_permission('bonuses')) then
    raise exception using errcode='42501',message='No tenés permiso para acreditar bonos de recomendación.';
  end if;
  select * into reward from public.referral_rewards where id=p_reward_id for update;
  if not found then raise exception using errcode='22023',message='El bono ya no existe.'; end if;
  if reward.status<>'credited' then
    if reward.status<>'reserved' or reward.reserved_by<>auth.uid() then
      raise exception using errcode='22023',message='Tomá el bono antes de acreditar. Si está reservado, debe confirmarlo el mismo operador.';
    end if;
    update public.referral_rewards set status='credited',credited_at=now(),credited_by=auth.uid()
      where id=reward.id returning * into reward;
    insert into public.referral_reward_events(reward_id,actor_id,action) values(reward.id,auth.uid(),'credited');
  end if;
  return next reward;
end $$;
revoke all on function public.mark_referral_reward_credited(uuid) from public,anon,authenticated;
grant execute on function public.mark_referral_reward_credited(uuid) to authenticated;

create function public.list_referral_rewards(p_status text default 'pending',p_offset integer default 0)
returns table(
  id uuid,beneficiary_user_id uuid,username text,external_user_id text,beneficiary_role text,
  amount numeric,status text,created_at timestamptz,credited_at timestamptz,
  referred_name text,referrer_name text,reserved_by uuid,total_count bigint
)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or not (public.has_admin_permission('users') or public.has_admin_permission('bonuses')) then
    raise exception using errcode='42501',message='No tenés permiso para consultar los bonos de recomendación.';
  end if;
  if p_status is null or p_status not in ('pending','credited') or p_offset is null or p_offset<0 then
    raise exception using errcode='22023',message='Filtro de recomendados no válido.';
  end if;
  return query select r.id,r.beneficiary_user_id,coalesce(b.username,b.display_name),b.external_user_id,
    r.beneficiary_role,r.amount,r.status,r.created_at,r.credited_at,
    coalesce(d.username,d.display_name),coalesce(f.username,f.display_name),r.reserved_by,count(*) over()
    from public.referral_rewards r
    join public.player_referrals l on l.referred_user_id=r.referred_user_id
    join public.user_profiles b on b.user_id=r.beneficiary_user_id
    join public.user_profiles d on d.user_id=l.referred_user_id
    join public.user_profiles f on f.user_id=l.referrer_user_id
    where (p_status='pending' and r.status in ('pending','reserved')) or (p_status='credited' and r.status='credited')
    order by r.created_at desc,r.id limit 10 offset p_offset;
end $$;
revoke all on function public.list_referral_rewards(text,integer) from public,anon,authenticated;
grant execute on function public.list_referral_rewards(text,integer) to authenticated;

create or replace view public.player_directory with (security_invoker = true) as
select p.user_id,p.username,p.display_name,p.phone,p.external_user_id,p.whatsapp_principal_slot,
  w.phone as whatsapp_principal_phone,p.created_at,p.updated_at,
  coalesce((select count(*) from public.requests r where r.user_id=p.user_id and r.kind='deposit'),0) as deposits,
  coalesce((select count(*) from public.requests r where r.user_id=p.user_id and r.kind='withdrawal'),0) as withdrawals,
  l.referrer_user_id,coalesce(f.username,f.display_name) as referrer_name
from public.user_profiles p
left join public.whatsapp_principals w on w.slot=p.whatsapp_principal_slot
left join public.player_referrals l on l.referred_user_id=p.user_id
left join public.user_profiles f on f.user_id=l.referrer_user_id
where not public.is_panel_user(p.user_id);
revoke all on public.player_directory from public,anon,authenticated;
grant select on public.player_directory to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename='referral_rewards') then
    alter publication supabase_realtime add table public.referral_rewards;
  end if;
end $$;

commit;
