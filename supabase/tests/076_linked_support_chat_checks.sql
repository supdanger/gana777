-- Ejecutar después de la migración 076 en un proyecto de prueba.
-- Todas las filas creadas se revierten al finalizar.
begin;

select set_config('test.chat_player', gen_random_uuid()::text, true);
select set_config('test.chat_staff', gen_random_uuid()::text, true);
select set_config('test.chat_thread', gen_random_uuid()::text, true);
select set_config('test.chat_username', 'chat_' || substr(md5(current_setting('test.chat_player')),1,12), true);

insert into auth.users(id,email) values
  (current_setting('test.chat_player')::uuid,'chat-player-' || current_setting('test.chat_player') || '@example.invalid'),
  (current_setting('test.chat_staff')::uuid,'chat-staff-' || current_setting('test.chat_staff') || '@example.invalid');
update public.user_profiles set username=current_setting('test.chat_username')
  where user_id=current_setting('test.chat_player')::uuid;
insert into public.admin_users(user_id,is_super_admin)
  values(current_setting('test.chat_staff')::uuid,false);
insert into public.cashier_profiles(user_id,username,display_name)
  values(current_setting('test.chat_staff')::uuid,
    'chat_' || substr(md5(current_setting('test.chat_staff')),1,12),'Cajero de prueba');
insert into public.admin_permissions(user_id,chat,external_chat)
  values(current_setting('test.chat_staff')::uuid,true,true);
insert into public.external_chat_threads(id,nickname,token_hash,origin)
  values(current_setting('test.chat_thread')::uuid,
    'chat' || substr(md5(current_setting('test.chat_thread')),1,12),
    md5(current_setting('test.chat_thread')) || md5('token-' || current_setting('test.chat_thread')),
    'https://gana777bet.com');
insert into public.external_chat_messages(thread_id,sender_type,body)
  values(current_setting('test.chat_thread')::uuid,'visitor','Mensaje anterior desde la burbuja');

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.chat_player'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.chat_player'),true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.messages(user_id,sender_id,body)
  values(current_setting('test.chat_player')::uuid,current_setting('test.chat_player')::uuid,
    'Mensaje privado anterior al vínculo');
do $$
begin
  if exists(select 1 from public.unified_chat_messages where source='external') then
    raise exception 'FAIL: el jugador podía leer el chat externo antes del vínculo';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.chat_staff'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.chat_staff'),true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
begin
  if public.link_external_chat(current_setting('test.chat_thread')::uuid,current_setting('test.chat_username'))
    is distinct from current_setting('test.chat_player')::uuid then
    raise exception 'FAIL: no se vinculó el jugador correcto';
  end if;
  if exists(select 1 from public.external_chat_inbox
    where thread_id=current_setting('test.chat_thread')::uuid) then
    raise exception 'FAIL: la conversación vinculada sigue en Chat externo';
  end if;
  if not exists(select 1 from public.chat_inbox
    where user_id=current_setting('test.chat_player')::uuid) then
    raise exception 'FAIL: la conversación vinculada no aparece en Chat';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.chat_player'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.chat_player'),true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
begin
  if (select count(*) from public.unified_chat_messages
    where user_id=current_setting('test.chat_player')::uuid) <> 2 then
    raise exception 'FAIL: el jugador no ve ambos historiales vinculados';
  end if;
end;
$$;
select set_config('app.platform_password_notice','on',true);
insert into public.messages(user_id,sender_id,body)
  values(current_setting('test.chat_player')::uuid,current_setting('test.chat_player')::uuid,
    'Aviso privado para la cuenta');
select set_config('app.platform_password_notice','off',true);
do $$
begin
  if not exists(select 1 from public.messages
    where user_id=current_setting('test.chat_player')::uuid
      and body='Aviso privado para la cuenta' and external_visible=false) then
    raise exception 'FAIL: un aviso privado quedó visible para la burbuja';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.chat_staff'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.chat_staff'),true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.unlink_external_chat(current_setting('test.chat_thread')::uuid);
do $$
begin
  if exists(select 1 from public.unified_chat_messages
    where user_id=current_setting('test.chat_player')::uuid and source='external') then
    raise exception 'FAIL: el vínculo no fue retirado del chat normal';
  end if;
  if not exists(select 1 from public.external_chat_inbox
    where thread_id=current_setting('test.chat_thread')::uuid) then
    raise exception 'FAIL: el chat externo no volvió a su bandeja';
  end if;
end;
$$;

rollback;
