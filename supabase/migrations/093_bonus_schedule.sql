-- BORRADOR: NO EJECUTADO. Independiente del borrador 06; requiere migraciones 001–089.
-- Hora de Paraguay. Inicio incluido, fin excluido. Los días indican cuándo INICIA la franja.
begin;
alter table public.promotions
  add column bonus_start_time time,
  add column bonus_end_time time,
  add column bonus_days smallint[] not null default array[1,2,3,4,5,6,7]::smallint[];
alter table public.promotions add constraint promotions_daily_window check (
  cardinality(bonus_days) between 1 and 7
  and bonus_days <@ array[1,2,3,4,5,6,7]::smallint[]
  and array_position(bonus_days,null) is null
  and ((bonus_start_time is null and bonus_end_time is null) or
    (bonus_start_time is not null and bonus_end_time is not null
      and bonus_start_time <> bonus_end_time
      and bonus_start_time < time '24:00' and bonus_end_time < time '24:00'
      and extract(second from bonus_start_time)=0 and extract(second from bonus_end_time)=0))
);

create function app_private.bonus_schedule_open(p_start time, p_end time, p_days smallint[], p_at timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select case
    when p_start is null and p_end is null then true
    when p_start is null or p_end is null or p_start=p_end or p_at is null then false
    when p_start<p_end then extract(isodow from local_time)::integer=any(p_days)
      and local_time::time>=p_start and local_time::time<p_end
    when local_time::time>=p_start then extract(isodow from local_time)::integer=any(p_days)
    when local_time::time<p_end then extract(isodow from local_time-interval '1 day')::integer=any(p_days)
    else false end
  from (select p_at at time zone 'America/Asuncion' as local_time) value;
$$;
revoke all on function app_private.bonus_schedule_open(time,time,smallint[],timestamptz) from public,anon,authenticated;

-- Se verifica en la inserción real, incluso si se omite el frontend o se usa una Edge antigua.
-- No se comprueba de nuevo al revisar/acreditar: requests ya conserva el premio solicitado.
create function public.guard_bonus_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_offer public.promotions%rowtype;
begin
  if new.kind<>'deposit' or new.bonus_id is null then return new; end if;
  select * into v_offer from public.promotions where id=new.bonus_id for share;
  if not found or not coalesce(app_private.bonus_schedule_open(
    v_offer.bonus_start_time,v_offer.bonus_end_time,v_offer.bonus_days,statement_timestamp()),false) then
    raise exception 'El bono está fuera de su horario disponible.';
  end if;
  return new;
end $$;
revoke all on function public.guard_bonus_schedule() from public,anon,authenticated;
-- validate_request copia y valida monto/porcentaje/número de carga; este guard solo añade el horario.
create trigger zz_guard_bonus_schedule before insert on public.requests
  for each row execute function public.guard_bonus_schedule();
commit;
