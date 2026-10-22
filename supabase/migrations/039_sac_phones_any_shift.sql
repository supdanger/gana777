-- Los teléfonos del puesto salen de todas las cuentas numeradas.
-- Antes solo aparecían las del turno de caja que estaba en línea.

begin;

create or replace function public.get_sac_board()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare active_shift text;
begin
  if auth.uid() is null or not public.sac_staff() then
    raise exception using errcode = '42501', message = 'Operación no permitida.';
  end if;
  select s.key into active_shift from public.work_shifts s where s.active limit 1;
  return jsonb_build_object(
    'active_shift', active_shift,
    'stations', (
      select coalesce(jsonb_agg(to_jsonb(station) order by station.number), '[]'::jsonb)
      from (
        select s.number, s.operator_name, s.started_at,
          coalesce((
            select jsonb_agg(sp.phone_number order by sp.phone_number)
            from public.sac_phones sp where sp.sac_number = s.number
          ), '[]'::jsonb) as phones
        from public.sac_stations s
      ) station
    ),
    'phones', (
      select coalesce(jsonb_agg(to_jsonb(phone) order by phone.phone), '[]'::jsonb)
      from (
        select b.phone_number as phone,
          coalesce((
            select jsonb_agg(name.holder order by name.holder)
            from (
              select distinct a.holder
              from public.bank_accounts a
              where a.phone_number = b.phone_number
                and a.holder is not null
                and btrim(a.holder) <> ''
                and (
                  active_shift is null
                  or a.shift_key = active_shift
                  or not exists (
                    select 1 from public.bank_accounts same
                    where same.phone_number = b.phone_number and same.shift_key = active_shift
                  )
                )
            ) name
          ), '[]'::jsonb) as holders,
          count(*) filter (where b.active and (active_shift is null or b.shift_key = active_shift)) as active_count,
          bool_or(active_shift is null or b.shift_key = active_shift) as on_shift
        from public.bank_accounts b
        where b.phone_number is not null
        group by b.phone_number
      ) phone
    )
  );
end $$;
revoke all on function public.get_sac_board() from public, anon, authenticated;
grant execute on function public.get_sac_board() to authenticated;

commit;
