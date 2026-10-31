begin;

create or replace function public.guard_request_input() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and current_setting('app.adjust_withdrawal_amount', true) = 'on' then
    if not public.has_admin_permission('withdrawal') or old.kind <> 'withdrawal' or old.status <> 'pending'
      or new.kind <> 'withdrawal' or new.status <> 'pending' or new.amount <= 0 or new.amount > 10000000
      or (to_jsonb(new) - 'amount') is distinct from (to_jsonb(old) - 'amount') then
      raise exception using errcode = '42501', message = 'No se puede modificar este retiro.';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if auth.role() in ('anon','authenticated') and not public.is_admin() then
      raise exception using errcode = '42501', message = 'Operación no permitida.';
    end if;
    if old.status <> 'pending' or new.status not in ('approved','rejected') then
      raise exception using errcode = '22023', message = 'Solo se puede revisar una solicitud pendiente.';
    end if;
    if old.requested_special_bonus_id is not null and new.status = 'approved'
      and current_setting('app.review_special_deposit', true) is distinct from 'on' then
      raise exception using errcode = '22023', message = 'Revisá el monto recibido y decidí si corresponde el bono especial.';
    end if;
    if current_setting('app.review_special_deposit', true) = 'on'
      and new.kind = 'deposit' and old.kind = 'deposit'
      and old.requested_special_bonus_id is not null
      and public.has_admin_permission('deposit') then
      if (to_jsonb(new) - array['status','amount','bonus_id','bonus_percent','bonus_amount'])
        is distinct from (to_jsonb(old) - array['status','amount','bonus_id','bonus_percent','bonus_amount']) then
        raise exception using errcode = '22023', message = 'No se pueden cambiar otros datos de la carga.';
      end if;
    elsif (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception using errcode = '22023', message = 'Solo se puede revisar una solicitud pendiente.';
    end if;
    return new;
  end if;
  if auth.role() in ('anon','authenticated') and (auth.uid() is null or new.user_id <> auth.uid()) then
    raise exception using errcode = '42501', message = 'Operación no permitida.';
  end if;
  if new.status <> 'pending' or new.amount <= 0 or new.amount > 999999999 then
    raise exception using errcode = '22023', message = 'Datos de solicitud no válidos.';
  end if;
  new.created_at := now();
  if new.kind = 'withdrawal' then
    new.holder := btrim(new.holder);
    new.alias := nullif(btrim(new.alias), '');
    if not app_private.valid_holder(new.holder) or new.cbu is null or new.cbu !~ '^[0-9]{22}$'
      or (new.alias is not null and new.alias !~ '^[a-zA-Z0-9.-]{6,20}$') then
      raise exception using errcode = '22023', message = 'Datos bancarios no válidos.';
    end if;
  end if;
  return new;
end $$;

create or replace function public.adjust_withdrawal_amount(p_request_id uuid, p_amount numeric)
returns numeric
language plpgsql security definer set search_path = '' as $$
declare current_request public.requests%rowtype;
begin
  if not public.has_admin_permission('withdrawal') then
    raise exception using errcode = '42501', message = 'No tenés permiso para modificar retiros.';
  end if;
  if p_request_id is null or p_amount is null or p_amount <= 0 or p_amount > 10000000 or p_amount <> round(p_amount, 2) then
    raise exception using errcode = '22023', message = 'Ingresá un monto válido.';
  end if;
  select * into current_request from public.requests where id = p_request_id for update;
  if not found or current_request.kind <> 'withdrawal' or current_request.status <> 'pending' then
    raise exception using errcode = '22023', message = 'Solo se puede modificar un retiro pendiente.';
  end if;
  perform 1 from public.withdrawal_parts where request_id = p_request_id for update;
  if exists (select 1 from public.withdrawal_parts where request_id = p_request_id and paid_at is not null) then
    raise exception using errcode = '22023', message = 'No se puede modificar un retiro que ya tiene pagos.';
  end if;
  perform set_config('app.adjust_withdrawal_amount', 'on', true);
  update public.requests set amount = p_amount where id = p_request_id;
  perform set_config('app.adjust_withdrawal_amount', 'off', true);
  delete from public.withdrawal_parts where request_id = p_request_id;
  insert into public.withdrawal_parts(request_id, part_number, amount)
  select p_request_id, n, least(100000::numeric, p_amount - (n - 1) * 100000::numeric)
  from generate_series(1, ceil(p_amount / 100000)::integer) as n;
  return p_amount;
end;
$$;
revoke all on function public.adjust_withdrawal_amount(uuid,numeric) from public, anon;
grant execute on function public.adjust_withdrawal_amount(uuid,numeric) to authenticated;

commit;
