-- Ejecutar después de 026 en un proyecto de prueba. La transacción revierte todo.
begin;
select set_config('test.withdrawal_user', gen_random_uuid()::text, true);
select set_config('test.withdrawal_other', gen_random_uuid()::text, true);
select set_config('test.withdrawal_admin', gen_random_uuid()::text, true);
insert into auth.users(id, email) values
  (current_setting('test.withdrawal_user')::uuid, 'withdrawal-user-' || current_setting('test.withdrawal_user') || '@example.invalid'),
  (current_setting('test.withdrawal_other')::uuid, 'withdrawal-other-' || current_setting('test.withdrawal_other') || '@example.invalid'),
  (current_setting('test.withdrawal_admin')::uuid, 'withdrawal-admin-' || current_setting('test.withdrawal_admin') || '@example.invalid');
insert into public.admin_users(user_id, is_super_admin) values (current_setting('test.withdrawal_admin')::uuid, true);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.withdrawal_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('test.withdrawal_request', (
  select id::text from public.create_withdrawal('1000000', 'Persona Prueba', '0123456789012345678901', null)
), true);
do $$ begin
  if (select count(*) from public.withdrawal_parts where request_id = current_setting('test.withdrawal_request')::uuid) <> 10
    or (select sum(amount) from public.withdrawal_parts where request_id = current_setting('test.withdrawal_request')::uuid) <> 1000000
    or exists (select 1 from public.withdrawal_parts where request_id = current_setting('test.withdrawal_request')::uuid and amount <> 100000)
  then raise exception 'FAIL: el millón no se dividió en diez pagos de 100.000.'; end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.withdrawal_other'), true);
do $$ begin
  if exists (select 1 from public.withdrawal_parts where request_id = current_setting('test.withdrawal_request')::uuid)
  then raise exception 'FAIL: un jugador leyó pagos ajenos.'; end if;
end $$;
select set_config('test.withdrawal_remainder', (
  select id::text from public.create_withdrawal('250001', 'Persona Prueba', '0123456789012345678901', null)
), true);
do $$ begin
  if (select count(*) from public.withdrawal_parts where request_id = current_setting('test.withdrawal_remainder')::uuid) <> 3
    or (select amount from public.withdrawal_parts where request_id = current_setting('test.withdrawal_remainder')::uuid and part_number = 3) <> 50001
  then raise exception 'FAIL: el pago final no conserva el resto.'; end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.withdrawal_admin'), true);
do $$ begin
  begin
    update public.requests set status = 'approved' where id = current_setting('test.withdrawal_request')::uuid;
    raise exception 'FAIL: se aprobó el retiro sin pagar las partes.';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.confirm_withdrawal_part(current_setting('test.withdrawal_request')::uuid, 1,
      current_setting('test.withdrawal_request') || '/1/' || gen_random_uuid()::text || '.jpg');
    raise exception 'FAIL: se aceptó un comprobante inexistente.';
  exception when invalid_parameter_value then null; end;
end $$;
update public.requests set status = 'rejected' where id = current_setting('test.withdrawal_remainder')::uuid;
select set_config('request.jwt.claim.sub', current_setting('test.withdrawal_other'), true);
do $$ begin
  if (select count(*) from public.create_withdrawal('1000', 'Persona Prueba', '0123456789012345678901', null)) <> 1
  then raise exception 'FAIL: no se pudo solicitar otro retiro después de un rechazo.'; end if;
end $$;

reset role;
update public.withdrawal_parts set receipt_path = request_id::text || '/1/' || gen_random_uuid()::text || '.jpg',
  paid_at = now(), paid_by = current_setting('test.withdrawal_admin')::uuid
  where request_id = current_setting('test.withdrawal_request')::uuid and part_number = 1;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.withdrawal_admin'), true);
do $$ begin
  begin
    update public.requests set status = 'rejected' where id = current_setting('test.withdrawal_request')::uuid;
    raise exception 'FAIL: se rechazó un retiro parcialmente pagado.';
  exception when invalid_parameter_value then null; end;
end $$;

reset role;
update public.withdrawal_parts set
  receipt_path = request_id::text || '/' || part_number::text || '/' || gen_random_uuid()::text || '.jpg',
  paid_at = now(), paid_by = current_setting('test.withdrawal_admin')::uuid
where request_id = current_setting('test.withdrawal_request')::uuid and paid_at is null;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.withdrawal_admin'), true);
update public.requests set status = 'approved' where id = current_setting('test.withdrawal_request')::uuid;
do $$ begin
  if not exists (select 1 from public.requests where id = current_setting('test.withdrawal_request')::uuid
    and status = 'approved' and approved_at is not null)
  then raise exception 'FAIL: el retiro completo no se acreditó.'; end if;
end $$;

rollback;
