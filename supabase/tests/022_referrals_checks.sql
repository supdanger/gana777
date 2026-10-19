-- Ejecutar como postgres DESPUÉS de 022, preferentemente en un proyecto de prueba.
-- Usa transacciones y revierte todas las cuentas, comprobantes y eventos ficticios.
begin;
select set_config('test.referrer',gen_random_uuid()::text,true);
select set_config('test.referred',gen_random_uuid()::text,true);
select set_config('test.other',gen_random_uuid()::text,true);
select set_config('test.staff_a',gen_random_uuid()::text,true);
select set_config('test.staff_b',gen_random_uuid()::text,true);
select set_config('test.bank',gen_random_uuid()::text,true);
select set_config('test.promo',gen_random_uuid()::text,true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);

insert into auth.users(id,email)
select current_setting('test.'||name)::uuid,'referral-test-'||current_setting('test.'||name)||'@example.invalid'
from unnest(array['referrer','referred','other','staff_a','staff_b']) names(name);
insert into public.admin_users(user_id,is_super_admin) values
  (current_setting('test.staff_a')::uuid,true),(current_setting('test.staff_b')::uuid,true);
insert into public.bank_accounts(id,bank,holder,cbu,alias,active) values
  (current_setting('test.bank')::uuid,'Prueba','Persona Prueba','0123456789012345678901','prueba.referrals',false);
insert into public.promotions(id,title,active,selectable,bonus_mode,bonus_amount,bonus_percent,min_amount,max_amount)
  values(current_setting('test.promo')::uuid,'Bono de prueba',true,true,'fixed',1000,0,1,999999999);

create function pg_temp.referral_test_deposit(target uuid,offer uuid default null) returns uuid
language plpgsql as $$
declare assignment uuid; result uuid;
begin
  insert into public.bank_account_assignments(user_id,bank_account_id)
    values(target,current_setting('test.bank')::uuid) returning id into assignment;
  insert into public.requests(user_id,kind,amount,bank_assignment_id,receipt_url,cloudinary_asset_id,bonus_id)
    values(target,'deposit',5000,assignment,
      'https://res.cloudinary.com/test/image/authenticated/'||gen_random_uuid()::text,
      gen_random_uuid()::text,offer) returning id into result;
  return result;
end $$;

insert into public.player_referrals(referred_user_id,referrer_user_id)
  values(current_setting('test.referred')::uuid,current_setting('test.referrer')::uuid);
do $$ begin
  begin
    insert into public.player_referrals(referred_user_id,referrer_user_id)
      values(current_setting('test.other')::uuid,current_setting('test.other')::uuid);
    raise exception 'FAIL: autorrecomendación permitida.';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.player_referrals(referred_user_id,referrer_user_id)
      values(current_setting('test.referrer')::uuid,current_setting('test.referred')::uuid);
    raise exception 'FAIL: ciclo de recomendación permitido.';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.player_referrals(referred_user_id,referrer_user_id)
      values(current_setting('test.other')::uuid,current_setting('test.staff_a')::uuid);
    raise exception 'FAIL: un operador puede recibir premios como recomendador.';
  exception when invalid_parameter_value then null; end;
end $$;

select set_config('test.rejected',pg_temp.referral_test_deposit(current_setting('test.referred')::uuid)::text,true);
select set_config('test.first',pg_temp.referral_test_deposit(current_setting('test.referred')::uuid,current_setting('test.promo')::uuid)::text,true);
select set_config('test.second',pg_temp.referral_test_deposit(current_setting('test.referred')::uuid)::text,true);
select set_config('test.ordinary',pg_temp.referral_test_deposit(current_setting('test.other')::uuid)::text,true);
do $$ begin
  if exists(select 1 from public.referral_rewards where referred_user_id=current_setting('test.referred')::uuid) then
    raise exception 'FAIL: se premió una carga pendiente.';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.staff_a'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.staff_a'),true);
select set_config('request.jwt.claim.role','authenticated',true);
update public.requests set status='rejected' where id=current_setting('test.rejected')::uuid;
do $$ begin
  if exists(select 1 from public.referral_rewards where referred_user_id=current_setting('test.referred')::uuid) then
    raise exception 'FAIL: se premió una carga rechazada.';
  end if;
end $$;
update public.requests set status='approved' where id=current_setting('test.first')::uuid;
update public.requests set status='approved' where id=current_setting('test.second')::uuid;
update public.requests set status='approved' where id=current_setting('test.ordinary')::uuid;
do $$ begin
  if (select count(*) from public.referral_rewards where referred_user_id=current_setting('test.referred')::uuid)<>2 then
    raise exception 'FAIL: debe haber exactamente dos premios después de dos cargas aprobadas.';
  end if;
  if (select sum(amount) from public.referral_rewards where referred_user_id=current_setting('test.referred')::uuid)<>2000 then
    raise exception 'FAIL: el total de premios no es $2.000.';
  end if;
  if exists(select 1 from public.referral_rewards where
    (referred_user_id=current_setting('test.referred')::uuid and source_request_id<>current_setting('test.first')::uuid)
    or beneficiary_user_id=current_setting('test.other')::uuid) then
    raise exception 'FAIL: un premio no corresponde a la primera aprobación o se otorgó sin recomendación.';
  end if;
  if (select bonus_amount from public.requests where id=current_setting('test.first')::uuid)<>1000 then
    raise exception 'FAIL: se alteró el bono normal de la carga.';
  end if;
end $$;
select set_config('test.reward',(select id::text from public.referral_rewards
  where referred_user_id=current_setting('test.referred')::uuid and beneficiary_role='referrer'),true);
do $$ begin
  begin
    perform public.mark_referral_reward_credited(current_setting('test.reward')::uuid);
    raise exception 'FAIL: se acreditó sin reservar.';
  exception when invalid_parameter_value then null; end;
end $$;
select public.reserve_referral_reward(current_setting('test.reward')::uuid);

select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.staff_b'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.staff_b'),true);
do $$ begin
  begin
    perform public.reserve_referral_reward(current_setting('test.reward')::uuid);
    raise exception 'FAIL: dos operadores pueden tomar el mismo premio.';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.mark_referral_reward_credited(current_setting('test.reward')::uuid);
    raise exception 'FAIL: un operador puede confirmar una reserva ajena.';
  exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.staff_a'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.staff_a'),true);
select public.release_referral_reward(current_setting('test.reward')::uuid);
select public.reserve_referral_reward(current_setting('test.reward')::uuid);
select public.mark_referral_reward_credited(current_setting('test.reward')::uuid);
select public.mark_referral_reward_credited(current_setting('test.reward')::uuid);
do $$ begin
  if (select count(*) from public.referral_reward_events where reward_id=current_setting('test.reward')::uuid and action='credited')<>1 then
    raise exception 'FAIL: repetir la confirmación duplica la acreditación.';
  end if;
end $$;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.referrer'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.referrer'),true);
do $$ begin
  if (select count(*) from public.referral_rewards)<>1 then raise exception 'FAIL: el jugador puede leer premios ajenos.'; end if;
  begin
    perform public.list_referral_rewards();
    raise exception 'FAIL: un jugador puede consultar el directorio de premios.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reserve_referral_reward(current_setting('test.reward')::uuid);
    raise exception 'FAIL: un jugador puede administrar premios.';
  exception when insufficient_privilege then null; end;
  begin
    update public.referral_rewards set status='pending' where id=current_setting('test.reward')::uuid;
    raise exception 'FAIL: un jugador puede modificar directamente premios.';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin
    insert into public.player_referrals(referred_user_id,referrer_user_id)
      values(current_setting('test.other')::uuid,current_setting('test.referrer')::uuid);
    raise exception 'FAIL: se admitió una recomendación retroactiva.';
  exception when invalid_parameter_value then null; end;
  if has_table_privilege('authenticated','public.referral_rewards','INSERT')
    or has_table_privilege('authenticated','public.referral_rewards','UPDATE') then
    raise exception 'FAIL: el cliente tiene permisos de escritura directa en premios.';
  end if;
end $$;
rollback;
