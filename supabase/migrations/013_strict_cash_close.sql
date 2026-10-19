-- El cierre es total: invalida reservas y no devuelve cuentas mientras esté activo.
-- También publica el cambio de estado para retirar las cuentas de pantallas abiertas.
begin;

drop policy if exists bank_operation_admin_read on public.bank_operation_state;
drop policy if exists bank_operation_read on public.bank_operation_state;
create policy bank_operation_read on public.bank_operation_state for select to authenticated using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bank_operation_state'
  ) then
    alter publication supabase_realtime add table public.bank_operation_state;
  end if;
end $$;

create or replace function public.start_cash_close(p_minutes integer,p_next_shift text)
returns setof public.bank_operation_state
language plpgsql security definer set search_path = '' as $$
declare outgoing text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception using errcode = '42501',message = 'Operación no permitida.'; end if;
  if p_minutes < 1 or p_minutes > 10 then raise exception using errcode = '22023',message = 'El cierre debe durar entre 1 y 10 minutos.'; end if;
  if p_next_shift not in ('morning','afternoon','night') then raise exception using errcode = '22023',message = 'Turno no válido.'; end if;
  perform pg_advisory_xact_lock(777011);
  select key into outgoing from public.work_shifts where active limit 1;
  update public.bank_account_assignments set status = 'expired' where status = 'reserved';
  update public.work_shifts set active = false,updated_at = now() where active;
  update public.bank_operation_state as state set mode = 'closing',outgoing_shift_key = outgoing,
    next_shift_key = p_next_shift,resumes_at = now() + make_interval(mins => p_minutes),updated_at = now() where state.id;
  return query select * from public.bank_operation_state;
end $$;
revoke all on function public.start_cash_close(integer,text) from public,anon,authenticated;
grant execute on function public.start_cash_close(integer,text) to authenticated;

create or replace function public.start_bank_maintenance()
returns setof public.bank_operation_state
language plpgsql security definer set search_path = '' as $$
declare outgoing text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception using errcode = '42501',message = 'Operación no permitida.'; end if;
  perform pg_advisory_xact_lock(777011);
  select coalesce((select key from public.work_shifts where active limit 1),
    (select state.outgoing_shift_key from public.bank_operation_state state where state.id)) into outgoing;
  update public.bank_account_assignments set status = 'expired' where status = 'reserved';
  update public.work_shifts set active = false,updated_at = now() where active;
  update public.bank_operation_state as state set mode = 'maintenance',outgoing_shift_key = outgoing,
    next_shift_key = null,resumes_at = null,updated_at = now() where state.id;
  return query select * from public.bank_operation_state;
end $$;
revoke all on function public.start_bank_maintenance() from public,anon,authenticated;
grant execute on function public.start_bank_maintenance() to authenticated;

create or replace function public.assign_bank_account()
returns table(assignment_id uuid,id uuid,bank text,holder text,cbu text,alias text)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing_assignment uuid; chosen_account uuid;
  current_mode text; deadline timestamptz; incoming text;
begin
  if actor is null or auth.role() is distinct from 'authenticated' then raise exception using errcode = '42501',message = 'Ingresá a tu cuenta.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,11));
  perform pg_advisory_xact_lock(777011);
  select s.mode,s.resumes_at,s.next_shift_key into current_mode,deadline,incoming
    from public.bank_operation_state s where s.id for update;
  if current_mode = 'closing' and deadline <= now() then
    update public.work_shifts set active = false,updated_at = now() where active;
    update public.work_shifts set active = true,updated_at = now() where key = incoming;
    update public.bank_operation_state as state set mode = 'online',outgoing_shift_key = null,
      next_shift_key = null,resumes_at = null,updated_at = now() where state.id;
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
    return query select a.id,b.id,b.bank,b.holder,b.cbu,b.alias from public.bank_account_assignments a
      join public.bank_accounts b on b.id = a.bank_account_id where a.id = existing_assignment;
    return;
  end if;

  select b.id into chosen_account from public.bank_accounts b
    join public.work_shifts s on s.key = b.shift_key and s.active where b.active
    order by b.usage_count + (select count(*) from public.bank_account_assignments a
      where a.bank_account_id = b.id and a.status = 'reserved' and a.expires_at > now()),b.usage_count,b.id
    for update of b limit 1;
  if chosen_account is null then raise exception 'No hay una cuenta habilitada para recibir cargas.'; end if;
  insert into public.bank_account_assignments as created(user_id,bank_account_id)
    values(actor,chosen_account) returning created.id into existing_assignment;
  return query select a.id,b.id,b.bank,b.holder,b.cbu,b.alias from public.bank_account_assignments a
    join public.bank_accounts b on b.id = a.bank_account_id where a.id = existing_assignment;
end $$;
revoke all on function public.assign_bank_account() from public,anon,authenticated;
grant execute on function public.assign_bank_account() to authenticated;

commit;
