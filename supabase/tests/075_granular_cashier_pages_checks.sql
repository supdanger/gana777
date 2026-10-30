-- Ejecutar como postgres después de la migración 075 en un proyecto de prueba.
-- La transacción revierte el cajero, la conversación y los cambios de ajustes.
begin;

select set_config('test.cashier', gen_random_uuid()::text, true);
select set_config('test.external_thread', gen_random_uuid()::text, true);
insert into auth.users(id,email)
  values (current_setting('test.cashier')::uuid, 'cashier-075-' || current_setting('test.cashier') || '@example.invalid');
insert into public.admin_users(user_id,is_super_admin)
  values (current_setting('test.cashier')::uuid,false);
insert into public.cashier_profiles(user_id,username,display_name)
  values (current_setting('test.cashier')::uuid,'audit75_' || substr(md5(current_setting('test.cashier')),1,8),'Prueba de permisos');
insert into public.admin_permissions(user_id,deposit,users,contacts,bonuses,chat)
  values (current_setting('test.cashier')::uuid,true,true,true,true,true);
insert into public.external_chat_threads(id,nickname,token_hash,origin)
  values (current_setting('test.external_thread')::uuid,
    'audit' || substr(md5(current_setting('test.external_thread')),1,10),
    md5(current_setting('test.external_thread')) || md5('token-' || current_setting('test.external_thread')),
    'https://gana777bet.com');
insert into public.external_chat_messages(thread_id,sender_type,body)
  values (current_setting('test.external_thread')::uuid,'visitor','Mensaje de prueba');

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.cashier'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.cashier'),true);
select set_config('request.jwt.claim.role','authenticated',true);

do $$
declare permission_name text;
begin
  foreach permission_name in array array['external_chat','access_requests','platform','referrals','wheel','portal','announcements','themes','telegram'] loop
    if public.has_admin_permission(permission_name) then
      raise exception 'FAIL: % heredó un acceso antiguo', permission_name;
    end if;
  end loop;
  if exists(select 1 from public.external_chat_inbox) then
    raise exception 'FAIL: Chat externo visible con el permiso Chat';
  end if;
  if public.wheel_can_manage() then
    raise exception 'FAIL: Ruleta visible con Cargas o Bonos';
  end if;
  begin
    update public.app_settings set home_banner_title='audit-' || substr(gen_random_uuid()::text,1,8) where id=true;
    raise exception 'FAIL: Contactos pudo editar Portal';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
update public.admin_permissions
  set external_chat=true,access_requests=true,platform=true,referrals=true,wheel=true,portal=true,
      announcements=true,themes=true,telegram=true,
      contacts=false,updated_at=now()
  where user_id=current_setting('test.cashier')::uuid;
set local role authenticated;

do $$
declare permission_name text;
begin
  foreach permission_name in array array['external_chat','access_requests','platform','referrals','wheel','portal','announcements','themes','telegram'] loop
    if not public.has_admin_permission(permission_name) then
      raise exception 'FAIL: % no se activó', permission_name;
    end if;
  end loop;
  if not exists(select 1 from public.external_chat_inbox where thread_id=current_setting('test.external_thread')::uuid) then
    raise exception 'FAIL: Chat externo no visible tras activarlo';
  end if;
  if not public.wheel_can_manage() then
    raise exception 'FAIL: Ruleta no disponible con su propio permiso';
  end if;
  update public.app_settings set home_banner_title='audit-' || substr(gen_random_uuid()::text,1,8) where id=true;
  begin
    update public.app_settings set show_instagram=not show_instagram where id=true;
    raise exception 'FAIL: Portal pudo editar Contactos';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
