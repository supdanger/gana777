-- Turnos bancarios y reparto concurrente de cuentas.
-- Las cuentas existentes se conservan y quedan inicialmente en el turno mañana.
begin;

create table public.work_shifts (
  key text primary key check (key in ('morning', 'afternoon', 'night')),
  label text not null unique,
  active boolean not null default false,
  updated_at timestamptz not null default now()
);
create unique index one_active_work_shift on public.work_shifts(active) where active;
insert into public.work_shifts(key,label,active) values
  ('morning','Turno mañana',true),
  ('afternoon','Turno tarde',false),
  ('night','Turno noche',false);

drop index if exists public.one_active_bank;
alter table public.bank_accounts
  add column shift_key text not null default 'morning' references public.work_shifts(key) on update cascade,
  add column usage_count bigint not null default 0 check (usage_count >= 0);
create index bank_accounts_shift_available on public.bank_accounts(shift_key,active,usage_count,id);

create table public.bank_account_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  status text not null default 'reserved' check (status in ('reserved','confirmed','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  confirmed_at timestamptz
);
create unique index one_reserved_bank_per_user on public.bank_account_assignments(user_id) where status = 'reserved';
create index bank_assignments_account_status on public.bank_account_assignments(bank_account_id,status,expires_at);

alter table public.requests
  add column bank_account_id uuid references public.bank_accounts(id) on delete restrict,
  add column bank_assignment_id uuid unique references public.bank_account_assignments(id) on delete restrict;

alter table public.work_shifts enable row level security;
alter table public.bank_account_assignments enable row level security;
revoke all on public.work_shifts, public.bank_account_assignments from public, anon, authenticated;
grant select,update on public.work_shifts to authenticated;
grant select on public.bank_account_assignments to authenticated;

create policy shifts_admin_read on public.work_shifts for select to authenticated using (public.is_admin());
create policy shifts_admin_update on public.work_shifts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy assignments_admin_read on public.bank_account_assignments for select to authenticated using (public.is_admin());

drop policy if exists bank_read on public.bank_accounts;
drop policy if exists bank_manage on public.bank_accounts;
drop policy if exists security_bank_read on public.bank_accounts;
drop policy if exists security_bank_insert on public.bank_accounts;
drop policy if exists security_bank_update on public.bank_accounts;
drop policy if exists security_bank_delete on public.bank_accounts;
create policy bank_admin_read on public.bank_accounts for select to authenticated using (public.is_admin());
create policy bank_admin_insert on public.bank_accounts for insert to authenticated with check (public.is_admin());
create policy bank_admin_update on public.bank_accounts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy bank_admin_delete on public.bank_accounts for delete to authenticated using (public.is_admin());

create or replace function public.assign_bank_account()
returns table(assignment_id uuid, id uuid, bank text, holder text, cbu text, alias text)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  existing_assignment uuid;
  chosen_account uuid;
begin
  if actor is null or auth.role() is distinct from 'authenticated' then
    raise exception using errcode = '42501', message = 'Ingresá a tu cuenta.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 11));

  select a.id into existing_assignment
  from public.bank_account_assignments a
  where a.user_id = actor and a.status = 'reserved' and a.expires_at > now()
  order by a.created_at desc limit 1;

  if existing_assignment is not null then
    return query select a.id,b.id,b.bank,b.holder,b.cbu,b.alias
      from public.bank_account_assignments a
      join public.bank_accounts b on b.id = a.bank_account_id
      where a.id = existing_assignment;
    return;
  end if;

  update public.bank_account_assignments
  set status = 'expired'
  where user_id = actor and status = 'reserved' and expires_at <= now();

  -- Serializa únicamente la selección, que es muy corta, para repartir de forma
  -- exacta incluso cuando cientos de usuarios entran al mismo tiempo.
  perform pg_advisory_xact_lock(777011);
  select b.id into chosen_account
  from public.bank_accounts b
  join public.work_shifts s on s.key = b.shift_key and s.active
  where b.active
  order by b.usage_count + (
    select count(*) from public.bank_account_assignments a
    where a.bank_account_id = b.id and a.status = 'reserved' and a.expires_at > now()
  ), b.usage_count, b.id
  for update of b
  limit 1;

  if chosen_account is null then
    raise exception 'No hay una cuenta habilitada para recibir cargas.';
  end if;

  insert into public.bank_account_assignments as created(user_id,bank_account_id)
  values(actor,chosen_account) returning created.id into existing_assignment;

  return query select a.id,b.id,b.bank,b.holder,b.cbu,b.alias
    from public.bank_account_assignments a
    join public.bank_accounts b on b.id = a.bank_account_id
    where a.id = existing_assignment;
end $$;
revoke all on function public.assign_bank_account() from public, anon, authenticated;
grant execute on function public.assign_bank_account() to authenticated;

create or replace function public.set_active_shift(p_shift text)
returns setof public.work_shifts
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'Operación no permitida.';
  end if;
  if p_shift not in ('morning','afternoon','night') then
    raise exception using errcode = '22023', message = 'Turno no válido.';
  end if;
  perform pg_advisory_xact_lock(777011);
  update public.work_shifts set active = false, updated_at = now() where active;
  update public.work_shifts set active = true, updated_at = now() where key = p_shift;
  return query select s.* from public.work_shifts s order by case s.key when 'morning' then 1 when 'afternoon' then 2 else 3 end;
end $$;
revoke all on function public.set_active_shift(text) from public, anon, authenticated;
grant execute on function public.set_active_shift(text) to authenticated;

create or replace function public.validate_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  offer public.promotions%rowtype;
  assignment public.bank_account_assignments%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if new.kind = 'withdrawal' and exists (
    select 1 from public.requests where user_id = new.user_id and kind = 'withdrawal'
      and created_at > now() - interval '24 hours'
  ) then raise exception 'Solo podés solicitar un retiro cada 24 horas.'; end if;
  if new.kind = 'deposit' then
    if new.bank_assignment_id is null then raise exception 'La cuenta asignada ya no está disponible.'; end if;
    select * into assignment from public.bank_account_assignments
    where id = new.bank_assignment_id and user_id = new.user_id and status = 'reserved'
      and expires_at > now() for update;
    if not found then raise exception 'La asignación de la cuenta venció. Volvé a iniciar la carga.'; end if;
    new.bank_account_id := assignment.bank_account_id;
    if new.receipt_url is null or new.cloudinary_asset_id is null then
      raise exception 'El comprobante debe subirse mediante Cloudinary.';
    end if;
    if new.bonus_id is not null then
      select * into offer from public.promotions
      where id = new.bonus_id and active and selectable
        and new.amount >= min_amount and new.amount <= max_amount
        and ((bonus_mode = 'percent' and bonus_percent > 0 and bonus_amount = 0)
          or (bonus_mode = 'fixed' and bonus_amount > 0 and bonus_percent = 0));
      if not found then raise exception 'El bono no está habilitado para ese monto.'; end if;
      if offer.bonus_mode = 'fixed' then new.bonus_percent := 0; new.bonus_amount := offer.bonus_amount;
      else new.bonus_percent := offer.bonus_percent; new.bonus_amount := 0; end if;
    else new.bonus_percent := 0; new.bonus_amount := 0; end if;

    update public.bank_account_assignments set status = 'confirmed', confirmed_at = now()
      where id = assignment.id;
    update public.bank_accounts set usage_count = usage_count + 1
      where id = assignment.bank_account_id;
  end if;
  return new;
end $$;
revoke all on function public.validate_request() from public, anon, authenticated;

commit;
