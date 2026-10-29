-- Contadores de bonos por turno con resumen histórico y reinicio al cierre.
begin;

create table public.bonus_counter_shifts (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  started_by uuid references auth.users(id) on delete set null,
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null,
  summary jsonb,
  constraint bonus_counter_shift_close_state check (
    (ended_at is null and ended_by is null and summary is null)
    or (ended_at is not null and summary is not null)
  )
);
create unique index bonus_counter_one_active on public.bonus_counter_shifts ((true)) where ended_at is null;
alter table public.bonus_counter_shifts enable row level security;
revoke all on public.bonus_counter_shifts from public, anon, authenticated;
grant select on public.bonus_counter_shifts to authenticated;
create policy bonus_counter_shifts_home_read on public.bonus_counter_shifts
  for select to authenticated using (public.has_admin_permission('home'));

-- El turno inicial empieza al aplicar esta migración; los registros anteriores
-- quedan fuera del primer cierre para no atribuirlos a un turno incorrecto.
insert into public.bonus_counter_shifts(started_by)
select auth.uid()
where not exists (select 1 from public.bonus_counter_shifts where ended_at is null);

create function public.bonus_counter_shift_summary(p_started_at timestamptz, p_ended_at timestamptz)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with grouped as (
    select
      coalesce(r.bonus_id::text, 'none') as bonus_key,
      case when r.bonus_id is null then 'Sin bono'
        else coalesce(nullif(max(p.title), ''), nullif(max(r.bonus_reward_label), ''), 'Bono') end as title,
      r.bonus_reward_type as reward_type,
      r.bonus_reward_label as reward_label,
      count(*)::integer as loads,
      case when r.bonus_reward_type = 'free_spins' then 0::numeric
        when r.bonus_percent > 0 then sum(round(r.amount * r.bonus_percent / 100, 2))
        else count(*) * r.bonus_amount end as bonus_total,
      count(*) filter (where r.bonus_reward_type = 'free_spins')::integer as free_spins
    from public.requests r
    left join public.promotions p on p.id = r.bonus_id
    where r.kind = 'deposit' and r.status = 'approved'
      and r.approved_at >= p_started_at and r.approved_at < p_ended_at
    group by r.bonus_id, r.bonus_percent, r.bonus_amount, r.bonus_reward_type, r.bonus_reward_label
  ), totals as (
    select coalesce(sum(loads), 0)::integer as total_loads,
      coalesce(sum(loads) filter (where bonus_key = 'none'), 0)::integer as without_bonus,
      coalesce(sum(bonus_total), 0)::numeric as total_bonus,
      coalesce(sum(free_spins), 0)::integer as total_free_spins
    from grouped
  )
  select jsonb_build_object(
    'counters', coalesce((select jsonb_agg(jsonb_build_object(
      'key', bonus_key || ':' || reward_type || ':' || coalesce(reward_label, ''),
      'title', title,
      'loads', loads,
      'bonusTotal', bonus_total,
      'rewardType', reward_type,
      'rewardLabel', reward_label,
      'freeSpins', free_spins
    ) order by loads desc, title) from grouped), '[]'::jsonb),
    'totalLoads', totals.total_loads,
    'withoutBonus', totals.without_bonus,
    'totalBonusGranted', totals.total_bonus,
    'freeSpinsGranted', totals.total_free_spins
  ) from totals;
$$;
revoke all on function public.bonus_counter_shift_summary(timestamptz,timestamptz) from public, anon, authenticated;

create function public.get_bonus_counter_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare active public.bonus_counter_shifts%rowtype; result jsonb;
begin
  if not public.has_admin_permission('home') then
    raise exception using errcode = '42501', message = 'No tenés permiso para ver los contadores de bonos.';
  end if;
  select * into active from public.bonus_counter_shifts where ended_at is null order by id desc limit 1;
  if not found then raise exception 'No hay un turno activo para los contadores.'; end if;
  select jsonb_build_object(
    'active', jsonb_build_object('id', active.id, 'started_at', active.started_at,
      'summary', public.bonus_counter_shift_summary(active.started_at, now())),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
      'id', archived.id, 'started_at', archived.started_at, 'ended_at', archived.ended_at,
      'summary', archived.summary
    ) order by archived.ended_at desc) from public.bonus_counter_shifts archived where archived.ended_at is not null), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.get_bonus_counter_dashboard() from public, anon, authenticated;
grant execute on function public.get_bonus_counter_dashboard() to authenticated;

create function public.close_bonus_counter_shift() returns bigint
language plpgsql security definer set search_path = '' as $$
declare active public.bonus_counter_shifts%rowtype; closed_at timestamptz := now(); snapshot jsonb;
begin
  if not public.has_admin_permission('home') then
    raise exception using errcode = '42501', message = 'No tenés permiso para cerrar el turno de bonos.';
  end if;
  select * into active from public.bonus_counter_shifts where ended_at is null order by id desc limit 1 for update;
  if not found then raise exception 'No hay un turno activo para cerrar.'; end if;
  snapshot := public.bonus_counter_shift_summary(active.started_at, closed_at);
  update public.bonus_counter_shifts set ended_at = closed_at, ended_by = auth.uid(), summary = snapshot where id = active.id;
  insert into public.bonus_counter_shifts(started_by) values (auth.uid());
  return active.id;
end $$;
revoke all on function public.close_bonus_counter_shift() from public, anon, authenticated;
grant execute on function public.close_bonus_counter_shift() to authenticated;

commit;
