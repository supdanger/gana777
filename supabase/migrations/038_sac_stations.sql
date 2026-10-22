-- Puestos SAC: cada PC atiende los teléfonos que elige al abrir su turno.
-- Las cargas siguen a la cuenta y, desde ahí, al teléfono y al SAC.

begin;

alter table public.bank_accounts
  add column if not exists phone_number integer
  check (phone_number is null or phone_number between 1 and 30);
create index if not exists bank_accounts_phone_idx on public.bank_accounts(phone_number) where phone_number is not null;

create table public.sac_stations (
  number integer primary key check (number between 1 and 5),
  operator_name text,
  started_at timestamptz,
  started_by uuid references auth.users(id) on delete set null,
  constraint sac_shift_pair check (
    (started_at is null and operator_name is null)
    or (started_at is not null and operator_name is not null and char_length(operator_name) between 1 and 40)
  )
);
insert into public.sac_stations(number) select generate_series(1, 5);

create table public.sac_phones (
  phone_number integer primary key check (phone_number between 1 and 30),
  sac_number integer not null references public.sac_stations(number)
);
create index sac_phones_sac_idx on public.sac_phones(sac_number);

create table public.sac_shift_events (
  id uuid primary key default gen_random_uuid(),
  sac_number integer not null check (sac_number between 1 and 5),
  operator_name text not null check (char_length(operator_name) between 1 and 40),
  action text not null check (action in ('start', 'end')),
  phones integer[] not null default '{}',
  telegram_status text not null default 'pending' check (telegram_status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  created_at timestamptz not null default now()
);

alter table public.sac_stations enable row level security;
alter table public.sac_phones enable row level security;
alter table public.sac_shift_events enable row level security;
revoke all on public.sac_stations, public.sac_phones, public.sac_shift_events from public, anon, authenticated;
grant select on public.sac_stations, public.sac_phones to authenticated;

create policy sac_stations_read on public.sac_stations for select to authenticated
  using (public.has_admin_permission('deposit') or public.has_admin_permission('shifts') or public.has_admin_permission('accounts'));
create policy sac_phones_read on public.sac_phones for select to authenticated
  using (public.has_admin_permission('deposit') or public.has_admin_permission('shifts') or public.has_admin_permission('accounts'));

create or replace function public.sac_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_admin_permission('deposit') or public.has_admin_permission('shifts');
$$;
revoke all on function public.sac_staff() from public, anon, authenticated;

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
              select distinct a.holder from public.bank_accounts a
              where a.shift_key = active_shift and a.phone_number = b.phone_number
            ) name
          ), '[]'::jsonb) as holders,
          count(*) filter (where b.active) as active_count
        from public.bank_accounts b
        where b.shift_key = active_shift and b.phone_number is not null
        group by b.phone_number
      ) phone
    )
  );
end $$;
revoke all on function public.get_sac_board() from public, anon, authenticated;
grant execute on function public.get_sac_board() to authenticated;

create or replace function public.start_sac_shift(p_sac integer, p_name text)
returns table(event_id uuid, sac_number integer, operator_name text)
language plpgsql security definer set search_path = '' as $fn$
declare clean_name text; opened timestamptz; created uuid;
begin
  if auth.uid() is null or not public.sac_staff() then
    raise exception using errcode = '42501', message = 'Operación no permitida.';
  end if;
  if p_sac is null or p_sac < 1 or p_sac > 5 then
    raise exception using errcode = 'P0001', message = 'Elegí un SAC del 1 al 5.';
  end if;
  clean_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(clean_name) < 1 or char_length(clean_name) > 40 or clean_name ~ '[[:cntrl:]]' then
    raise exception using errcode = 'P0001', message = 'Escribí el nombre de quien inicia el turno.';
  end if;
  perform pg_advisory_xact_lock(777013);
  select s.started_at into opened from public.sac_stations s where s.number = p_sac for update;
  if not found then raise exception using errcode = 'P0001', message = 'Elegí un SAC del 1 al 5.'; end if;
  if opened is not null then raise exception using errcode = 'P0001', message = 'Ese SAC ya tiene un turno abierto.'; end if;
  update public.sac_stations
    set operator_name = clean_name, started_at = now(), started_by = auth.uid()
    where number = p_sac;
  insert into public.sac_shift_events(sac_number, operator_name, action, phones)
  values (
    p_sac, clean_name, 'start',
    coalesce((select array_agg(sp.phone_number order by sp.phone_number) from public.sac_phones sp where sp.sac_number = p_sac), '{}')
  )
  returning id into created;
  return query select created, p_sac, clean_name;
end $fn$;
revoke all on function public.start_sac_shift(integer, text) from public, anon, authenticated;
grant execute on function public.start_sac_shift(integer, text) to authenticated;

create or replace function public.end_sac_shift(p_sac integer)
returns table(event_id uuid, sac_number integer, operator_name text, phones integer[])
language plpgsql security definer set search_path = '' as $$
declare current_name text; opened timestamptz; current_phones integer[]; created uuid;
begin
  if auth.uid() is null or not public.sac_staff() then
    raise exception using errcode = '42501', message = 'Operación no permitida.';
  end if;
  if p_sac is null or p_sac < 1 or p_sac > 5 then
    raise exception using errcode = 'P0001', message = 'Elegí un SAC del 1 al 5.';
  end if;
  perform pg_advisory_xact_lock(777013);
  select s.operator_name, s.started_at into current_name, opened
    from public.sac_stations s where s.number = p_sac for update;
  if not found then raise exception using errcode = 'P0001', message = 'Elegí un SAC del 1 al 5.'; end if;
  if opened is null or current_name is null then
    raise exception using errcode = 'P0001', message = 'Ese SAC no tiene un turno abierto.';
  end if;
  select coalesce(array_agg(sp.phone_number order by sp.phone_number), '{}') into current_phones
    from public.sac_phones sp where sp.sac_number = p_sac;
  update public.sac_stations set operator_name = null, started_at = null, started_by = null where number = p_sac;
  insert into public.sac_shift_events(sac_number, operator_name, action, phones)
  values (p_sac, current_name, 'end', current_phones)
  returning id into created;
  return query select created, p_sac, current_name, current_phones;
end $$;
revoke all on function public.end_sac_shift(integer) from public, anon, authenticated;
grant execute on function public.end_sac_shift(integer) to authenticated;

create or replace function public.set_sac_phones(p_sac integer, p_phones integer[])
returns integer[]
language plpgsql security definer set search_path = '' as $$
declare opened timestamptz;
begin
  if auth.uid() is null or not public.sac_staff() then
    raise exception using errcode = '42501', message = 'Operación no permitida.';
  end if;
  if p_sac is null or p_sac < 1 or p_sac > 5 then
    raise exception using errcode = 'P0001', message = 'Elegí un SAC del 1 al 5.';
  end if;
  if p_phones is null then
    raise exception using errcode = 'P0001', message = 'Elegí teléfonos que ya tengan cuentas cargadas.';
  end if;
  if cardinality(p_phones) > 20 then
    raise exception using errcode = 'P0001', message = 'Elegí hasta 20 teléfonos.';
  end if;
  if exists (select 1 from unnest(p_phones) phone group by phone having count(*) > 1)
     or exists (select 1 from unnest(p_phones) phone where phone < 1 or phone > 30) then
    raise exception using errcode = 'P0001', message = 'Elegí teléfonos que ya tengan cuentas cargadas.';
  end if;
  perform pg_advisory_xact_lock(777013);
  select s.started_at into opened from public.sac_stations s where s.number = p_sac for update;
  if not found then raise exception using errcode = 'P0001', message = 'Elegí un SAC del 1 al 5.'; end if;
  if opened is null then
    raise exception using errcode = 'P0001', message = 'Iniciá el turno de ese SAC antes de elegir teléfonos.';
  end if;
  if cardinality(p_phones) > 0 and exists (
    select 1 from unnest(p_phones) phone
    where not exists (select 1 from public.bank_accounts b where b.phone_number = phone)
  ) then
    raise exception using errcode = 'P0001', message = 'Elegí teléfonos que ya tengan cuentas cargadas.';
  end if;
  if exists (
    select 1 from public.sac_phones sp
    where sp.phone_number = any(p_phones) and sp.sac_number <> p_sac
  ) then
    raise exception using errcode = 'P0001', message = 'Un teléfono elegido ya está en otro SAC.';
  end if;
  delete from public.sac_phones where sac_number = p_sac;
  insert into public.sac_phones(sac_number, phone_number)
  select p_sac, phone from unnest(p_phones) phone;
  return (select coalesce(array_agg(sp.phone_number order by sp.phone_number), '{}') from public.sac_phones sp where sp.sac_number = p_sac);
end $$;
revoke all on function public.set_sac_phones(integer, integer[]) from public, anon, authenticated;
grant execute on function public.set_sac_phones(integer, integer[]) to authenticated;

-- La ruta se calcula al leer: si el teléfono cambia de SAC, la carga pendiente se va con él.
create or replace function public.deposit_route(p_request_id uuid)
returns table(deposit_holder text, deposit_phone integer, deposit_sac integer)
language sql stable security definer set search_path = '' as $$
  select ba.holder, ba.phone_number, sp.sac_number
  from public.requests r
  left join public.bank_accounts ba on ba.id = r.bank_account_id
  left join public.sac_phones sp on sp.phone_number = ba.phone_number
  where r.id = p_request_id and r.kind = 'deposit'
    and (
      r.user_id = (select auth.uid())
      or public.has_admin_permission('deposit')
      or public.has_admin_permission('history')
      or public.has_admin_permission('home')
      or public.has_admin_permission('shifts')
    );
$$;
revoke all on function public.deposit_route(uuid) from public, anon, authenticated;
grant execute on function public.deposit_route(uuid) to authenticated;

create or replace view public.request_summaries with (security_invoker = true) as
select r.id, r.user_id, coalesce(p.username, p.display_name, 'Usuario') as user_name, r.kind, r.amount, r.status, r.created_at,
  r.holder, r.cbu, r.alias, r.receipt_path,
  to_jsonb(r)->>'receipt_url' as receipt_url,
  (to_jsonb(r)->>'bonus_id')::uuid as bonus_id,
  coalesce((to_jsonb(r)->>'bonus_percent')::numeric, 0) as bonus_percent,
  coalesce(r.bonus_amount, 0) as bonus_amount,
  r.approved_at,
  dc.credited_at,
  route.deposit_holder,
  route.deposit_phone,
  route.deposit_sac
from public.requests r
left join public.user_profiles p on p.user_id = r.user_id
left join public.deposit_credits dc on dc.request_id = r.id
left join lateral public.deposit_route(r.id) route on true;
grant select on public.request_summaries to authenticated;

-- Mientras ningún SAC tenga teléfonos, se mantiene el reparto anterior.
create or replace function public.assign_bank_account()
returns table(
  assignment_id uuid, id uuid, bank text, holder text, cbu text, alias text,
  theme_key text, theme_background_path text, theme_logo_path text
)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing_assignment uuid; chosen_account uuid;
  current_mode text; deadline timestamptz; incoming text; sac_routing boolean;
begin
  if actor is null or auth.role() is distinct from 'authenticated' then raise exception using errcode = '42501', message = 'Ingresá a tu cuenta.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 11));
  perform pg_advisory_xact_lock(777011);
  select s.mode, s.resumes_at, s.next_shift_key into current_mode, deadline, incoming
    from public.bank_operation_state s where s.id for update;
  if current_mode = 'closing' and deadline <= now() then
    update public.work_shifts set active = false, updated_at = now() where active;
    update public.work_shifts set active = true, updated_at = now() where key = incoming;
    update public.bank_operation_state as state set mode = 'online', outgoing_shift_key = null,
      next_shift_key = null, resumes_at = null, updated_at = now() where state.id;
    current_mode := 'online';
  end if;
  if current_mode = 'closing' then raise exception 'Estamos realizando el cierre de caja.'; end if;
  if current_mode = 'maintenance' then raise exception 'Las cargas están temporalmente en mantenimiento.'; end if;

  update public.bank_account_assignments set status = 'expired'
    where user_id = actor and status = 'reserved' and expires_at <= now();
  select a.id into existing_assignment from public.bank_account_assignments a
    where a.user_id = actor and a.status = 'reserved' and a.expires_at > now()
    order by a.created_at desc limit 1;
  if existing_assignment is not null then
    return query select a.id, b.id, b.bank, b.holder, b.cbu, b.alias, b.theme_key, t.background_path, t.logo_path
      from public.bank_account_assignments a join public.bank_accounts b on b.id = a.bank_account_id
      join public.bank_themes t on t.key = b.theme_key where a.id = existing_assignment;
    return;
  end if;

  select exists(select 1 from public.sac_phones) into sac_routing;
  select b.id into chosen_account from public.bank_accounts b
    join public.work_shifts s on s.key = b.shift_key and s.active
    where b.active and (not sac_routing or exists (
      select 1 from public.sac_phones sp where sp.phone_number = b.phone_number
    ))
    order by b.usage_count + (select count(*) from public.bank_account_assignments a
      where a.bank_account_id = b.id and a.status = 'reserved' and a.expires_at > now()), b.usage_count, b.id
    for update of b limit 1;
  if chosen_account is null then raise exception 'No hay una cuenta habilitada para recibir cargas.'; end if;
  insert into public.bank_account_assignments as created(user_id, bank_account_id)
    values (actor, chosen_account) returning created.id into existing_assignment;
  return query select a.id, b.id, b.bank, b.holder, b.cbu, b.alias, b.theme_key, t.background_path, t.logo_path
    from public.bank_account_assignments a join public.bank_accounts b on b.id = a.bank_account_id
    join public.bank_themes t on t.key = b.theme_key where a.id = existing_assignment;
end $$;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.sac_stations;
    exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.sac_phones;
    exception when duplicate_object then null; end;
  end if;
end $$;

commit;
