-- Ruleta diaria: ciclo personal, un giro cada 24 horas y acreditación manual.
-- No usa requests ni los bonos de carga. El mazo no se lee desde el cliente.
begin;

create table public.wheel_prizes (
  id uuid primary key default gen_random_uuid(),
  amount numeric(14,2) not null check (amount = trunc(amount) and amount > 0 and amount <= 100000000),
  slots integer not null check (slots between 1 and 40),
  active boolean not null default true,
  sort_order integer not null check (sort_order between 0 and 1000),
  created_at timestamptz not null default now(),
  unique (amount)
);

create table public.wheel_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  sequence numeric(14,2)[] not null,
  layout jsonb not null,
  cursor integer not null default 0,
  created_at timestamptz not null default now(),
  constraint wheel_cycle_sequence check (cardinality(sequence) between 1 and 60),
  constraint wheel_cycle_cursor check (cursor >= 0 and cursor <= cardinality(sequence)),
  constraint wheel_cycle_layout check (jsonb_typeof(layout) = 'array')
);
create unique index wheel_cycles_one_open on public.wheel_cycles(user_id) where cursor < cardinality(sequence);
create index wheel_cycles_user on public.wheel_cycles(user_id, created_at desc);

create table public.wheel_spins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  cycle_id uuid not null references public.wheel_cycles(id) on delete restrict,
  amount numeric(14,2) not null check (amount = trunc(amount) and amount > 0 and amount <= 100000000),
  position integer not null check (position > 0),
  status text not null default 'pending' check (status in ('pending', 'reserved', 'credited')),
  created_at timestamptz not null default now(),
  reserved_at timestamptz,
  reserved_by uuid references auth.users(id) on delete restrict,
  credited_at timestamptz,
  credited_by uuid references auth.users(id) on delete set null,
  unique (cycle_id, position),
  constraint wheel_spin_state check (
    (status = 'pending' and reserved_at is null and reserved_by is null and credited_at is null and credited_by is null) or
    (status = 'reserved' and reserved_at is not null and reserved_by is not null and credited_at is null and credited_by is null) or
    (status = 'credited' and reserved_at is not null and reserved_by is not null and credited_at is not null)
  )
);
create index wheel_spins_user on public.wheel_spins(user_id, created_at desc);
create index wheel_spins_queue on public.wheel_spins(status, created_at, id);

alter table public.wheel_prizes enable row level security;
alter table public.wheel_cycles enable row level security;
alter table public.wheel_spins enable row level security;
revoke all on public.wheel_prizes, public.wheel_cycles, public.wheel_spins from public, anon, authenticated, service_role;
grant select on public.wheel_prizes, public.wheel_spins to authenticated;
grant select on public.wheel_spins to service_role;

create function public.wheel_can_manage() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and auth.role() = 'authenticated'
    and (public.has_admin_permission('bonuses') or public.has_admin_permission('deposit'));
$$;
revoke all on function public.wheel_can_manage() from public, anon, authenticated;
grant execute on function public.wheel_can_manage() to authenticated;

create policy wheel_prizes_read on public.wheel_prizes for select to authenticated
  using (active or public.wheel_can_manage());
create policy wheel_spins_read on public.wheel_spins for select to authenticated
  using (user_id = auth.uid() or public.wheel_can_manage());

-- Misma validación que src/wheel-sequence.ts. No arma el mazo.
create function public.wheel_check_prizes(p_prizes jsonb)
returns void
language plpgsql immutable set search_path = '' as $$
declare
  v_item jsonb;
  v_amount numeric;
  v_slots numeric;
  v_total integer := 0;
  v_seen numeric[] := array[]::numeric[];
begin
  if p_prizes is null or jsonb_typeof(p_prizes) <> 'array' or jsonb_array_length(p_prizes) < 1 then
    raise exception using errcode = '22023', message = 'La ruleta necesita al menos un premio.';
  end if;
  for v_item in select value from jsonb_array_elements(p_prizes) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'Cada premio necesita un monto entero.';
    end if;
    begin
      v_amount := (v_item->>'amount')::numeric;
      v_slots := (v_item->>'slots')::numeric;
    exception when others then
      raise exception using errcode = '22023', message = 'Cada premio necesita un monto entero.';
    end;
    if v_amount is null or v_amount <> trunc(v_amount) or v_amount <= 0 or v_amount > 100000000 then
      raise exception using errcode = '22023', message = 'Cada premio necesita un monto entero.';
    end if;
    if v_slots is null or v_slots <> trunc(v_slots) or v_slots < 1 or v_slots > 40 then
      raise exception using errcode = '22023', message = 'Cada premio necesita entre 1 y 40 espacios.';
    end if;
    if v_amount = any(v_seen) then
      raise exception using errcode = '22023', message = 'No puede haber dos premios con el mismo monto.';
    end if;
    v_seen := v_seen || v_amount;
    v_total := v_total + v_slots::integer;
  end loop;
  if v_total > 60 then
    raise exception using errcode = '22023', message = 'La ruleta acepta hasta 60 espacios.';
  end if;
end $$;
revoke all on function public.wheel_check_prizes(jsonb) from public, anon, authenticated;

-- Puerto de buildWheelSequence. random() = 0 elige la primera celda libre del tramo.
create function public.wheel_sequence(p_prizes jsonb)
returns numeric[]
language plpgsql volatile set search_path = '' as $$
declare
  v_prize record;
  v_total integer := 0;
  v_amounts numeric[] := array[]::numeric[];
  v_slots integer[] := array[]::integer[];
  v_count integer;
  v_prize_index integer;
  v_slot_index integer;
  v_band double precision;
  v_start integer;
  v_end integer;
  v_position integer;
  v_free integer[];
  v_chosen integer;
  v_pick integer;
  v_distance integer;
  v_before integer;
  v_after integer;
  v_board numeric[];
  v_taken boolean[];
begin
  perform public.wheel_check_prizes(p_prizes);
  for v_prize in
    select (item->>'amount')::numeric as amount, (item->>'slots')::integer as slots
    from jsonb_array_elements(p_prizes) item
    order by (item->>'amount')::numeric desc
  loop
    v_amounts := v_amounts || v_prize.amount;
    v_slots := v_slots || v_prize.slots;
    v_total := v_total + v_prize.slots;
  end loop;
  v_board := array_fill(null::numeric, array[v_total]);
  v_taken := array_fill(false, array[v_total]);
  v_count := cardinality(v_amounts);
  for v_prize_index in 1..v_count loop
    v_band := v_total::double precision / v_slots[v_prize_index];
    for v_slot_index in 0..v_slots[v_prize_index] - 1 loop
      v_start := floor(v_slot_index * v_band)::integer;
      v_end := greatest(v_start, floor((v_slot_index + 1) * v_band)::integer - 1);
      v_free := array[]::integer[];
      for v_position in v_start..v_end loop
        if not v_taken[v_position + 1] then v_free := v_free || v_position; end if;
      end loop;
      v_chosen := null;
      if cardinality(v_free) > 0 then
        v_pick := floor(random() * cardinality(v_free))::integer;
        v_chosen := v_free[v_pick + 1];
      end if;
      v_distance := 1;
      while v_chosen is null and v_distance < v_total loop
        v_before := v_start - v_distance;
        v_after := v_end + v_distance;
        if v_before >= 0 and not v_taken[v_before + 1] then v_chosen := v_before;
        elsif v_after < v_total and not v_taken[v_after + 1] then v_chosen := v_after;
        end if;
        v_distance := v_distance + 1;
      end loop;
      if v_chosen is null then
        raise exception using errcode = '22023', message = 'No hay espacio para armar la ruleta.';
      end if;
      v_taken[v_chosen + 1] := true;
      v_board[v_chosen + 1] := v_amounts[v_prize_index];
    end loop;
  end loop;
  if exists (select 1 from unnest(v_board) as value where value is null) then
    raise exception using errcode = '22023', message = 'No hay espacio para armar la ruleta.';
  end if;
  return v_board;
end $$;
revoke all on function public.wheel_sequence(jsonb) from public, anon, authenticated;

create function public.wheel_layout()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('amount', amount, 'slots', slots, 'sort_order', sort_order) order by sort_order, amount), '[]'::jsonb)
  from public.wheel_prizes where active;
$$;
revoke all on function public.wheel_layout() from public, anon, authenticated;

create function public.spin_wheel()
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

create function public.wheel_state()
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

create function public.replace_wheel_prizes(p_prizes jsonb)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_amount numeric;
  v_slots numeric;
  v_order integer;
  v_active boolean;
  v_seen numeric[] := array[]::numeric[];
  v_amounts numeric[] := array[]::numeric[];
  v_active_prizes jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' or not public.has_admin_permission('bonuses') then
    raise exception using errcode = '42501', message = 'No tenés permiso para cambiar los premios de la ruleta.';
  end if;
  if p_prizes is null or jsonb_typeof(p_prizes) <> 'array' or jsonb_array_length(p_prizes) < 1 or jsonb_array_length(p_prizes) > 60 then
    raise exception using errcode = '22023', message = 'La ruleta necesita al menos un premio.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gana777-wheel-prizes', 60));
  for v_item in select value from jsonb_array_elements(p_prizes) loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item->'active') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Cada premio necesita un monto entero.';
    end if;
    begin
      v_amount := (v_item->>'amount')::numeric;
      v_slots := (v_item->>'slots')::numeric;
      v_order := (v_item->>'sort_order')::integer;
    exception when others then
      raise exception using errcode = '22023', message = 'Cada premio necesita un monto entero.';
    end;
    v_active := (v_item->>'active')::boolean;
    if v_amount is null or v_amount <> trunc(v_amount) or v_amount <= 0 or v_amount > 100000000 then
      raise exception using errcode = '22023', message = 'Cada premio necesita un monto entero.';
    end if;
    if v_slots is null or v_slots <> trunc(v_slots) or v_slots < 1 or v_slots > 40 then
      raise exception using errcode = '22023', message = 'Cada premio necesita entre 1 y 40 espacios.';
    end if;
    if v_order is null or v_order < 0 or v_order > 1000 then
      raise exception using errcode = '22023', message = 'Cada premio necesita un monto entero.';
    end if;
    if v_amount = any(v_seen) then
      raise exception using errcode = '22023', message = 'No puede haber dos premios con el mismo monto.';
    end if;
    v_seen := v_seen || v_amount;
    v_amounts := v_amounts || v_amount;
    if v_active then
      v_active_prizes := v_active_prizes || jsonb_build_array(jsonb_build_object('amount', v_amount, 'slots', v_slots));
    end if;
    insert into public.wheel_prizes(amount, slots, active, sort_order)
      values (v_amount, v_slots::integer, v_active, v_order)
      on conflict (amount) do update set slots = excluded.slots, active = excluded.active, sort_order = excluded.sort_order;
  end loop;
  perform public.wheel_check_prizes(v_active_prizes);
  update public.wheel_prizes set active = false where not (amount = any(v_amounts));
end $$;
revoke all on function public.replace_wheel_prizes(jsonb) from public, anon, authenticated;
grant execute on function public.replace_wheel_prizes(jsonb) to authenticated;

create function public.list_wheel_prizes()
returns table(amount numeric, slots integer, active boolean, sort_order integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.wheel_can_manage() then
    raise exception using errcode = '42501', message = 'No tenés permiso para gestionar la ruleta.';
  end if;
  return query select p.amount, p.slots, p.active, p.sort_order from public.wheel_prizes p order by p.sort_order, p.amount;
end $$;
revoke all on function public.list_wheel_prizes() from public, anon, authenticated;
grant execute on function public.list_wheel_prizes() to authenticated;

create function public.list_wheel_spins(p_status text default 'pending', p_offset integer default 0)
returns table(
  id uuid, user_id uuid, username text, external_user_id text, amount numeric, status text,
  created_at timestamptz, credited_at timestamptz, reserved_by uuid, total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.wheel_can_manage() then
    raise exception using errcode = '42501', message = 'No tenés permiso para gestionar la ruleta.';
  end if;
  if p_status is null or p_status not in ('pending', 'credited') or p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'Filtro de ruleta no válido.';
  end if;
  return query select s.id, s.user_id, coalesce(p.username, p.display_name), p.external_user_id,
    s.amount, s.status, s.created_at, s.credited_at, s.reserved_by, count(*) over()
    from public.wheel_spins s
    join public.user_profiles p on p.user_id = s.user_id
    where (p_status = 'pending' and s.status in ('pending', 'reserved')) or (p_status = 'credited' and s.status = 'credited')
    order by s.created_at desc, s.id limit 10 offset p_offset;
end $$;
revoke all on function public.list_wheel_spins(text, integer) from public, anon, authenticated;
grant execute on function public.list_wheel_spins(text, integer) to authenticated;

create function public.reserve_wheel_spin(p_spin_id uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_spin public.wheel_spins%rowtype;
begin
  if not public.wheel_can_manage() then
    raise exception using errcode = '42501', message = 'No tenés permiso para gestionar la ruleta.';
  end if;
  select * into v_spin from public.wheel_spins where id = p_spin_id for update;
  if not found or v_spin.status = 'credited' then
    raise exception using errcode = '22023', message = 'El premio ya fue acreditado o no existe.';
  end if;
  if v_spin.status = 'reserved' and v_spin.reserved_by <> auth.uid() then
    raise exception using errcode = '22023', message = 'Otro operador está acreditando este premio.';
  end if;
  if v_spin.status = 'pending' then
    update public.wheel_spins set status = 'reserved', reserved_at = now(), reserved_by = auth.uid() where id = v_spin.id;
  end if;
end $$;
revoke all on function public.reserve_wheel_spin(uuid) from public, anon, authenticated;
grant execute on function public.reserve_wheel_spin(uuid) to authenticated;

create function public.release_wheel_spin(p_spin_id uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_spin public.wheel_spins%rowtype;
begin
  if not public.wheel_can_manage() then
    raise exception using errcode = '42501', message = 'No tenés permiso para gestionar la ruleta.';
  end if;
  select * into v_spin from public.wheel_spins where id = p_spin_id for update;
  if not found or v_spin.status <> 'reserved' or (v_spin.reserved_by <> auth.uid() and not public.is_super_admin()) then
    raise exception using errcode = '22023', message = 'No se puede liberar esta reserva.';
  end if;
  update public.wheel_spins set status = 'pending', reserved_at = null, reserved_by = null where id = v_spin.id;
end $$;
revoke all on function public.release_wheel_spin(uuid) from public, anon, authenticated;
grant execute on function public.release_wheel_spin(uuid) to authenticated;

alter table public.user_notifications add column wheel_spin_id uuid references public.wheel_spins(id);
alter table public.user_notifications drop constraint user_notifications_kind_check;
alter table public.user_notifications add constraint user_notifications_kind_check
  check (kind in ('deposit_credited', 'withdrawal_paid', 'chat_message', 'announcement', 'wheel_credited'));
alter table public.user_notifications drop constraint user_notifications_source_check;
alter table public.user_notifications add constraint user_notifications_source_check check (
  (kind = 'deposit_credited' and request_id is not null and part_number is null and message_id is null and announcement_id is null and scheduled_for is null and wheel_spin_id is null) or
  (kind = 'withdrawal_paid' and request_id is not null and part_number is not null and message_id is null and announcement_id is null and scheduled_for is null and wheel_spin_id is null) or
  (kind = 'chat_message' and request_id is null and part_number is null and message_id is not null and announcement_id is null and scheduled_for is null and wheel_spin_id is null) or
  (kind = 'announcement' and request_id is null and part_number is null and message_id is null and announcement_id is not null and scheduled_for is not null and wheel_spin_id is null) or
  (kind = 'wheel_credited' and request_id is null and part_number is null and message_id is null and announcement_id is null and scheduled_for is null and wheel_spin_id is not null)
);
create unique index user_notifications_wheel_once on public.user_notifications(wheel_spin_id) where kind = 'wheel_credited';

create function public.credit_wheel_spin(p_spin_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_spin public.wheel_spins%rowtype;
  v_notification_id uuid;
  v_money text;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or not (public.has_admin_permission('bonuses') or public.has_admin_permission('deposit')) then
    raise exception using errcode = '42501', message = 'No tenés permiso para acreditar premios de la ruleta.';
  end if;
  select * into v_spin from public.wheel_spins where id = p_spin_id for update;
  if not found then raise exception using errcode = '22023', message = 'El premio ya no existe.'; end if;
  if v_spin.status <> 'credited' then
    if v_spin.status <> 'reserved' or v_spin.reserved_by <> auth.uid() then
      raise exception using errcode = '22023', message = 'Tomá el premio antes de acreditar. Si está reservado, debe confirmarlo el mismo operador.';
    end if;
    update public.wheel_spins set status = 'credited', credited_at = now(), credited_by = auth.uid() where id = v_spin.id;
    v_money := '$' || replace(replace(replace(to_char(v_spin.amount, 'FM999,999,999,990'), ',', '.'), ' ', ''), chr(160), '');
    insert into public.user_notifications(user_id, kind, title, body, wheel_spin_id)
      values (v_spin.user_id, 'wheel_credited', 'Premio de la ruleta acreditado', 'Ya acreditamos ' || v_money || ' de la ruleta.', v_spin.id)
      on conflict (wheel_spin_id) where kind = 'wheel_credited' do nothing
      returning id into v_notification_id;
  end if;
  if v_notification_id is null then
    select id into v_notification_id from public.user_notifications
      where wheel_spin_id = v_spin.id and kind = 'wheel_credited';
  end if;
  return jsonb_build_object('id', v_spin.id, 'notification_id', v_notification_id);
end $$;
revoke all on function public.credit_wheel_spin(uuid) from public, anon, authenticated;
grant execute on function public.credit_wheel_spin(uuid) to authenticated;

insert into public.wheel_prizes(amount, slots, active, sort_order) values
  (500, 6, true, 1),
  (1000, 5, true, 2),
  (2000, 3, true, 3),
  (10000, 1, true, 4);

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wheel_spins') then
    alter publication supabase_realtime add table public.wheel_spins;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wheel_prizes') then
    alter publication supabase_realtime add table public.wheel_prizes;
  end if;
end $$;

commit;
