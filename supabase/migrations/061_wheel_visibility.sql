-- La ruleta nace apagada. Solo quien puede editar los premios la prende para los jugadores.
begin;

alter table public.app_settings
  add column if not exists wheel_enabled boolean not null default false;

create or replace function public.set_wheel_enabled(p_enabled boolean)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' or not public.has_admin_permission('bonuses') then
    raise exception using errcode = '42501', message = 'No tenés permiso para prender la ruleta.';
  end if;
  update public.app_settings set wheel_enabled = coalesce(p_enabled, false) where id;
end $$;
revoke all on function public.set_wheel_enabled(boolean) from public, anon, authenticated;
grant execute on function public.set_wheel_enabled(boolean) to authenticated;

create or replace function public.spin_wheel()
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_last timestamptz;
  v_cycle public.wheel_cycles%rowtype;
  v_prizes jsonb;
  v_layout jsonb;
  v_sequence numeric[];
  v_amount numeric;
  v_spin_id uuid;
begin
  if v_user is null or auth.role() is distinct from 'authenticated' then
    raise exception using errcode = '42501', message = 'Tenés que ingresar para girar.';
  end if;
  if public.is_panel_user(v_user) then
    raise exception using errcode = '42501', message = 'La ruleta es solo para jugadores.';
  end if;
  if not coalesce((select s.wheel_enabled from public.app_settings s where s.id), false) then
    raise exception using errcode = '22023', message = 'La ruleta está apagada.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 60));
  select created_at into v_last from public.wheel_spins where user_id = v_user order by created_at desc limit 1;
  if v_last is not null and v_last > now() - interval '24 hours' then
    raise exception using errcode = '22023', message = 'Ya giraste. El próximo giro se habilita 24 horas después.';
  end if;
  select * into v_cycle from public.wheel_cycles
    where user_id = v_user and cursor < cardinality(sequence) for update;
  if not found then
    perform pg_advisory_xact_lock(hashtextextended('gana777-wheel-prizes', 60));
    select coalesce(jsonb_agg(jsonb_build_object('amount', amount, 'slots', slots)), '[]'::jsonb)
      into v_prizes from public.wheel_prizes where active;
    if jsonb_array_length(v_prizes) < 1 then
      raise exception using errcode = '22023', message = 'La ruleta no tiene premios activos.';
    end if;
    v_layout := public.wheel_layout();
    v_sequence := public.wheel_sequence(v_prizes);
    insert into public.wheel_cycles(user_id, sequence, layout, cursor)
      values (v_user, v_sequence, v_layout, 0) returning * into v_cycle;
  end if;
  v_amount := v_cycle.sequence[v_cycle.cursor + 1];
  insert into public.wheel_spins(user_id, cycle_id, amount, position)
    values (v_user, v_cycle.id, v_amount, v_cycle.cursor + 1) returning id into v_spin_id;
  update public.wheel_cycles set cursor = cursor + 1 where id = v_cycle.id;
  return jsonb_build_object('id', v_spin_id, 'amount', v_amount);
end $$;
revoke all on function public.spin_wheel() from public, anon, authenticated;
grant execute on function public.spin_wheel() to authenticated;

create or replace function public.wheel_state()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_last timestamptz;
  v_layout jsonb;
  v_spins jsonb;
  v_next timestamptz;
  v_message text := null;
begin
  if v_user is null or auth.role() is distinct from 'authenticated' then
    raise exception using errcode = '42501', message = 'Tenés que ingresar para girar.';
  end if;
  select layout into v_layout from public.wheel_cycles
    where user_id = v_user and cursor < cardinality(sequence)
    order by created_at desc limit 1;
  if v_layout is null then v_layout := public.wheel_layout(); end if;
  if public.is_panel_user(v_user) then v_message := 'La ruleta es solo para jugadores.';
  elsif not coalesce((select s.wheel_enabled from public.app_settings s where s.id), false) then v_message := 'La ruleta está apagada.';
  elsif jsonb_array_length(v_layout) < 1 then v_message := 'La ruleta no tiene premios activos.';
  end if;
  select created_at into v_last from public.wheel_spins where user_id = v_user order by created_at desc limit 1;
  if v_message is null and v_last is not null and v_last > now() - interval '24 hours' then
    v_next := v_last + interval '24 hours';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'amount', amount, 'status', status, 'created_at', created_at, 'credited_at', credited_at
  ) order by created_at desc), '[]'::jsonb) into v_spins
  from (
    select id, amount, status, created_at, credited_at from public.wheel_spins
    where user_id = v_user order by created_at desc limit 8
  ) recent;
  return jsonb_build_object(
    'can_spin', v_message is null and v_next is null,
    'next_spin_at', v_next,
    'message', v_message,
    'prizes', v_layout,
    'spins', v_spins
  );
end $$;
revoke all on function public.wheel_state() from public, anon, authenticated;
grant execute on function public.wheel_state() to authenticated;

commit;
