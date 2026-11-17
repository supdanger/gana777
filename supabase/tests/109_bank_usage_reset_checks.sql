-- Ejecutar después de 109, en un proyecto de prueba. La transacción revierte todo.
begin;

insert into public.bank_accounts(id, bank, holder, cbu, alias, active, shift_key) values
  ('00000000-0000-4000-8000-0000000000a1', 'Banco A', 'Titular A', '1000000000000000000001', 'alias.a', false, 'morning'),
  ('00000000-0000-4000-8000-0000000000a2', 'Banco B', 'Titular B', '1000000000000000000002', 'alias.b', false, 'morning'),
  ('00000000-0000-4000-8000-0000000000a3', 'Banco C', 'Titular C', '1000000000000000000003', 'alias.c', false, 'morning'),
  ('00000000-0000-4000-8000-0000000000a4', 'Banco D', 'Titular D', '1000000000000000000004', 'alias.d', false, 'night');
update public.bank_accounts set active=true where id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000a4');
update public.bank_accounts set usage_count=40 where id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a2');
update public.bank_accounts set usage_count=12 where id='00000000-0000-4000-8000-0000000000a3';
update public.bank_accounts set usage_count=15 where id='00000000-0000-4000-8000-0000000000a4';

update public.bank_accounts set active=true where id='00000000-0000-4000-8000-0000000000a3';
do $$ begin
  if exists (select 1 from public.bank_accounts where id in (
    '00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000a2',
    '00000000-0000-4000-8000-0000000000a3') and usage_count<>0)
    then raise exception 'FAIL: habilitar no reinició las cuentas del turno mañana.'; end if;
  if (select usage_count from public.bank_accounts where id='00000000-0000-4000-8000-0000000000a4')<>15
    then raise exception 'FAIL: habilitar mañana reinició el turno noche.'; end if;
end $$;

update public.bank_accounts set usage_count=usage_count+1 where id='00000000-0000-4000-8000-0000000000a1';
do $$ begin
  if (select usage_count from public.bank_accounts where id='00000000-0000-4000-8000-0000000000a1')<>1
    or (select usage_count from public.bank_accounts where id='00000000-0000-4000-8000-0000000000a2')<>0
    then raise exception 'FAIL: sumar una carga no debe reiniciar el turno.'; end if;
end $$;

update public.bank_accounts set usage_count=9 where id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000a3');
update public.bank_accounts set active=false where id='00000000-0000-4000-8000-0000000000a2';
do $$ begin
  if exists (select 1 from public.bank_accounts where id in (
    '00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000a2',
    '00000000-0000-4000-8000-0000000000a3') and usage_count<>0)
    then raise exception 'FAIL: pausar no reinició las cuentas del turno mañana.'; end if;
  if (select usage_count from public.bank_accounts where id='00000000-0000-4000-8000-0000000000a4')<>15
    then raise exception 'FAIL: pausar mañana reinició el turno noche.'; end if;
end $$;

update public.bank_accounts set usage_count=4 where id='00000000-0000-4000-8000-0000000000a4';
update public.bank_accounts set alias='alias.nuevo', shift_key='night' where id='00000000-0000-4000-8000-0000000000a4';
do $$ begin
  if (select usage_count from public.bank_accounts where id='00000000-0000-4000-8000-0000000000a4')<>4
    then raise exception 'FAIL: guardar sin cambiar el turno reinició el contador.'; end if;
end $$;

update public.bank_accounts set usage_count=6 where id='00000000-0000-4000-8000-0000000000a4';
update public.bank_accounts set usage_count=7 where id='00000000-0000-4000-8000-0000000000a1';
insert into public.bank_accounts(id, bank, holder, cbu, alias, active, shift_key)
values ('00000000-0000-4000-8000-0000000000a5', 'Banco E', 'Titular E', '1000000000000000000005', 'alias.e', true, 'night');
do $$ begin
  if exists (select 1 from public.bank_accounts where id in (
    '00000000-0000-4000-8000-0000000000a4',
    '00000000-0000-4000-8000-0000000000a5') and usage_count<>0)
    then raise exception 'FAIL: una cuenta nueva no reinició su turno.'; end if;
  if (select usage_count from public.bank_accounts where id='00000000-0000-4000-8000-0000000000a1')<>7
    then raise exception 'FAIL: una cuenta de noche reinició el turno mañana.'; end if;
end $$;

update public.bank_accounts set usage_count=3 where id='00000000-0000-4000-8000-0000000000a5';
insert into public.bank_accounts(id, bank, holder, cbu, alias, active, shift_key, usage_count)
values ('00000000-0000-4000-8000-0000000000a6', 'Banco F', 'Titular F', '1000000000000000000006', 'alias.f', false, 'night', 0);
do $$ begin
  if (select usage_count from public.bank_accounts where id='00000000-0000-4000-8000-0000000000a5')<>3
    then raise exception 'FAIL: agregar una cuenta pausada reinició el turno.'; end if;
end $$;

update public.bank_accounts set usage_count=8 where id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a4');
update public.bank_accounts set shift_key='night' where id='00000000-0000-4000-8000-0000000000a1';
do $$ begin
  if exists (select 1 from public.bank_accounts where id in (
    '00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000a2',
    '00000000-0000-4000-8000-0000000000a4',
    '00000000-0000-4000-8000-0000000000a5') and usage_count<>0)
    then raise exception 'FAIL: mover una cuenta activa no reinició los dos turnos.'; end if;
end $$;

rollback;
