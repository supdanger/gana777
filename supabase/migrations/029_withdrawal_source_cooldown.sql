begin;

alter table public.withdrawal_parts
  add column source_bank_account_id uuid references public.bank_accounts(id) on delete restrict,
  add column source_bank_name text,
  add column source_alias text;
create index withdrawal_parts_source_paid_idx on public.withdrawal_parts(source_bank_account_id, paid_at desc)
  where source_bank_account_id is not null and paid_at is not null;

create function public.get_withdrawal_source_accounts()
returns table(id uuid, bank text, holder text, cbu text, alias text, theme_key text,
  theme_background_path text, theme_logo_path text, shift_key text, last_used_at timestamptz, ready_at timestamptz,
  server_now timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('withdrawal') then
    raise exception 'No tenés permiso para consultar cuentas de retiros.' using errcode = '42501';
  end if;
  -- Aplica cualquier cambio de turno programado que ya haya vencido.
  perform public.get_bank_operation_status();
  return query
    select b.id,b.bank,b.holder,b.cbu,b.alias,b.theme_key,t.background_path,t.logo_path,b.shift_key,
      last_payment.paid_at,last_payment.paid_at + interval '10 minutes',now()
    from public.bank_accounts b
    join public.work_shifts s on s.key=b.shift_key and s.active
    join public.bank_themes t on t.key=b.theme_key
    cross join public.bank_operation_state operation
    left join lateral (
      select p.paid_at from public.withdrawal_parts p
      where p.source_bank_account_id=b.id and p.paid_at is not null
      order by p.paid_at desc limit 1
    ) last_payment on true
    where b.active and operation.mode='online'
    order by b.bank,b.holder,b.id;
end $$;
revoke all on function public.get_withdrawal_source_accounts() from public,anon,authenticated;
grant execute on function public.get_withdrawal_source_accounts() to authenticated;

-- El bloqueo de la cuenta serializa pagos simultáneos hechos por distintos cajeros.
-- Las partes históricas conservan su origen vacío; desde ahora todo pago nuevo lo registra.
create function public.confirm_withdrawal_part(p_request_id uuid, p_part_number integer,
  p_receipt_path text, p_source_account_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_request public.requests%rowtype;
  v_part public.withdrawal_parts%rowtype;
  v_account public.bank_accounts%rowtype;
  v_last_paid_at timestamptz;
  v_total integer;
begin
  if not public.has_admin_permission('withdrawal') then
    raise exception 'No tenés permiso para acreditar retiros.' using errcode = '42501';
  end if;
  if p_source_account_id is null then
    raise exception 'Seleccioná la cuenta desde la que realizaste la transferencia.' using errcode = '22023';
  end if;
  perform public.get_bank_operation_status();
  if not exists (select 1 from public.bank_operation_state where mode='online') then
    raise exception 'No se pueden confirmar retiros durante el cierre o mantenimiento.' using errcode = '22023';
  end if;
  select * into v_account from public.bank_accounts where id=p_source_account_id for update;
  if not found or not v_account.active or not exists (
    select 1 from public.work_shifts where key=v_account.shift_key and active
  ) then raise exception 'Esta cuenta no está activa en el turno actual.' using errcode = '22023'; end if;
  select max(paid_at) into v_last_paid_at from public.withdrawal_parts
    where source_bank_account_id=p_source_account_id and paid_at is not null;
  if v_last_paid_at is not null and v_last_paid_at + interval '10 minutes' > now() then
    raise exception 'Esta cuenta sigue en enfriamiento. Elegí otra o esperá a que termine el contador.' using errcode = '22023';
  end if;
  select * into v_request from public.requests where id=p_request_id for update;
  if not found or v_request.kind <> 'withdrawal' or v_request.status <> 'pending' then
    raise exception 'El retiro ya no está pendiente.' using errcode = '22023';
  end if;
  if p_part_number is null or p_receipt_path is null
    or p_receipt_path !~ ('^' || p_request_id::text || '/' || p_part_number::text || '/[0-9a-f-]{36}[.](jpg|png|webp)$')
    or not exists (select 1 from storage.objects o where o.bucket_id='withdrawal-receipts' and o.name=p_receipt_path)
  then raise exception 'Comprobante de pago inválido.' using errcode = '22023'; end if;
  update public.withdrawal_parts
    set receipt_path=p_receipt_path, paid_at=now(), paid_by=auth.uid(),
      source_bank_account_id=v_account.id, source_bank_name=v_account.bank, source_alias=v_account.alias
    where request_id=p_request_id and part_number=p_part_number and paid_at is null
    returning * into v_part;
  if not found then raise exception 'Este pago ya fue confirmado.' using errcode = '22023'; end if;
  select count(*) into v_total from public.withdrawal_parts where request_id=p_request_id;
  insert into public.user_notifications(user_id,request_id,part_number,kind,title,body)
    values (v_request.user_id,p_request_id,p_part_number,'withdrawal_paid',
      'Retiro ' || p_part_number || ' de ' || v_total || ' realizado',
      'Transferimos $ ' || to_char(v_part.amount,'FM999G999G999G990D00') || '. El comprobante ya está en Tus retiros.');
  if not exists (select 1 from public.withdrawal_parts where request_id=p_request_id and paid_at is null) then
    update public.requests set status='approved' where id=p_request_id;
  end if;
end $$;
revoke all on function public.confirm_withdrawal_part(uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.confirm_withdrawal_part(uuid,integer,text,uuid) to authenticated;
drop function public.confirm_withdrawal_part(uuid,integer,text);

commit;
