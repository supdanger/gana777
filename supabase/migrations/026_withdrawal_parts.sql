begin;

-- 011 reintrodujo una espera desde la creación del retiro. La ventana vigente
-- la controla track_withdrawal_window desde la acreditación del último pago.
create or replace function public.validate_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  offer public.promotions%rowtype;
  assignment public.bank_account_assignments%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
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

-- Una solicitud conserva su monto total; cada transferencia tiene su propio comprobante.
create table public.withdrawal_parts (
  request_id uuid not null references public.requests(id) on delete cascade,
  part_number integer not null check (part_number > 0 and part_number <= 100),
  amount numeric(14,2) not null check (amount > 0 and amount <= 100000),
  receipt_path text unique,
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  primary key (request_id, part_number),
  constraint withdrawal_part_payment_complete check (
    (receipt_path is null and paid_at is null and paid_by is null) or
    (receipt_path is not null and paid_at is not null and paid_by is not null)
  )
);
create index withdrawal_parts_receipt_path_idx on public.withdrawal_parts(receipt_path) where receipt_path is not null;
alter table public.withdrawal_parts enable row level security;
revoke all on public.withdrawal_parts from public, anon, authenticated;
grant select on public.withdrawal_parts to authenticated;
create policy withdrawal_parts_read on public.withdrawal_parts for select to authenticated using (
  exists (select 1 from public.requests r where r.id = request_id
    and (r.user_id = auth.uid() or public.has_admin_permission('withdrawal')))
);
alter publication supabase_realtime add table public.withdrawal_parts;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('withdrawal-receipts', 'withdrawal-receipts', false, 5242880,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

-- Archivos temporales: solicitud/parte/uuid.ext. Solo personal de retiros puede subirlos.
create policy withdrawal_receipt_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'withdrawal-receipts' and public.has_admin_permission('withdrawal')
  and name ~ '^[0-9a-f-]{36}/[0-9]{1,3}/[0-9a-f-]{36}[.](jpg|png|webp)$'
  and exists (select 1 from public.withdrawal_parts p join public.requests r on r.id = p.request_id
    where p.request_id::text = split_part(name, '/', 1)
      and p.part_number::text = split_part(name, '/', 2)
      and p.paid_at is null and r.status = 'pending')
);
create policy withdrawal_receipt_read on storage.objects for select to authenticated using (
  bucket_id = 'withdrawal-receipts' and exists (
    select 1 from public.withdrawal_parts p join public.requests r on r.id = p.request_id
    where p.receipt_path = name
      and (r.user_id = auth.uid() or public.has_admin_permission('withdrawal'))
  )
);
-- Supabase Storage necesita SELECT además de DELETE para limpiar una subida fallida.
create policy withdrawal_receipt_temp_read on storage.objects for select to authenticated using (
  bucket_id = 'withdrawal-receipts' and public.has_admin_permission('withdrawal')
  and not exists (select 1 from public.withdrawal_parts p where p.receipt_path = name)
);
create policy withdrawal_receipt_cleanup on storage.objects for delete to authenticated using (
  bucket_id = 'withdrawal-receipts' and public.has_admin_permission('withdrawal')
  and not exists (select 1 from public.withdrawal_parts p where p.receipt_path = name)
);

create or replace function public.create_withdrawal_parts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind <> 'withdrawal' then return new; end if;
  if new.amount > 10000000 then
    raise exception 'El retiro máximo por solicitud es de $10.000.000.' using errcode = '22023';
  end if;
  insert into public.withdrawal_parts(request_id, part_number, amount)
  select new.id, n, least(100000::numeric, new.amount - (n - 1) * 100000::numeric)
  from generate_series(1, ceil(new.amount / 100000)::integer) as n;
  return new;
end $$;
revoke all on function public.create_withdrawal_parts() from public, anon, authenticated;
create trigger create_withdrawal_parts after insert on public.requests
for each row execute function public.create_withdrawal_parts();

-- Los retiros aún pendientes quedan divididos al aplicar esta migración.
do $$ begin
  if exists (select 1 from public.requests where kind = 'withdrawal' and status = 'pending' and amount > 10000000) then
    raise exception 'Hay retiros pendientes mayores a $10.000.000; resolverlos antes de aplicar 026.';
  end if;
end $$;
insert into public.withdrawal_parts(request_id, part_number, amount)
select r.id, n, least(100000::numeric, r.amount - (n - 1) * 100000::numeric)
from public.requests r
cross join lateral generate_series(1, ceil(r.amount / 100000)::integer) as n
where r.kind = 'withdrawal' and r.status = 'pending';

create or replace function public.guard_withdrawal_resolution() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.kind = 'withdrawal' and old.status = 'pending' and new.status <> old.status then
    if new.status = 'approved' and (
      coalesce((select sum(p.amount) from public.withdrawal_parts p where p.request_id = old.id), 0) <> old.amount
      or exists (select 1 from public.withdrawal_parts p where p.request_id = old.id and p.paid_at is null)
    ) then raise exception 'Faltan pagos por acreditar en este retiro.' using errcode = '22023'; end if;
    if new.status = 'rejected' and exists (
      select 1 from public.withdrawal_parts p where p.request_id = old.id and p.paid_at is not null
    ) then raise exception 'No se puede rechazar un retiro parcialmente pagado.' using errcode = '22023'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_withdrawal_resolution() from public, anon, authenticated;
create trigger guard_withdrawal_resolution before update of status on public.requests
for each row execute function public.guard_withdrawal_resolution();

create or replace function public.confirm_withdrawal_part(p_request_id uuid, p_part_number integer, p_receipt_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.requests%rowtype;
begin
  if not public.has_admin_permission('withdrawal') then
    raise exception 'No tenés permiso para acreditar retiros.' using errcode = '42501';
  end if;
  select * into v_request from public.requests where id = p_request_id for update;
  if not found or v_request.kind <> 'withdrawal' or v_request.status <> 'pending' then
    raise exception 'El retiro ya no está pendiente.' using errcode = '22023';
  end if;
  if p_part_number is null or p_receipt_path is null
    or p_receipt_path !~ ('^' || p_request_id::text || '/' || p_part_number::text || '/[0-9a-f-]{36}[.](jpg|png|webp)$')
    or not exists (select 1 from storage.objects o where o.bucket_id = 'withdrawal-receipts' and o.name = p_receipt_path)
  then raise exception 'Comprobante de pago inválido.' using errcode = '22023'; end if;
  update public.withdrawal_parts set receipt_path = p_receipt_path, paid_at = now(), paid_by = auth.uid()
    where request_id = p_request_id and part_number = p_part_number and paid_at is null;
  if not found then raise exception 'Este pago ya fue confirmado.' using errcode = '22023'; end if;
  if not exists (select 1 from public.withdrawal_parts where request_id = p_request_id and paid_at is null) then
    update public.requests set status = 'approved' where id = p_request_id;
  end if;
end $$;
revoke all on function public.confirm_withdrawal_part(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.confirm_withdrawal_part(uuid, integer, text) to authenticated;

commit;
