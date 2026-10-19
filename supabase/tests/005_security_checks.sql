-- Ejecutar después de 005, preferentemente en un proyecto de prueba.
-- No requiere extensiones. Crea usuarios temporales y revierte TODO al terminar.
begin;
select set_config('test.uid_a', gen_random_uuid()::text, true);
select set_config('test.uid_b', gen_random_uuid()::text, true);
select set_config('test.uid_admin', gen_random_uuid()::text, true);
insert into auth.users(id,email) values
  (current_setting('test.uid_a')::uuid,'security-a-'||current_setting('test.uid_a')||'@example.invalid'),
  (current_setting('test.uid_b')::uuid,'security-b-'||current_setting('test.uid_b')||'@example.invalid'),
  (current_setting('test.uid_admin')::uuid,'security-admin-'||current_setting('test.uid_admin')||'@example.invalid');
insert into public.admin_users(user_id) values(current_setting('test.uid_admin')::uuid);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',current_setting('test.uid_a'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.uid_a'),true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('test.request_a', (
  select id::text from public.create_withdrawal('100,25','María O''Neill','0123456789012345678901','cuenta.ejemplo')
),true);

do $$ begin
  if (select count(*) from public.request_summaries where id = current_setting('test.request_a')::uuid) <> 1 then
    raise exception 'FAIL: el usuario no puede leer su retiro.';
  end if;
  begin
    perform public.create_withdrawal('1; DROP TABLE public.requests','Nombre Apellido','0123456789012345678901',null);
    raise exception 'FAIL: se aceptó un monto con SQL.';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.create_withdrawal('10','Nombre Apellido','0123456789012345678901','x''; DROP TABLE users');
    raise exception 'FAIL: se aceptó un alias no válido.';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.requests(user_id,kind,amount,holder,cbu)
      values(current_setting('test.uid_b')::uuid,'withdrawal',10,'Nombre Apellido','0123456789012345678901');
    raise exception 'FAIL: se permitió la inserción directa de solicitudes.';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.messages(user_id,sender_id,body)
      values(current_setting('test.uid_b')::uuid,current_setting('test.uid_a')::uuid,'Consulta');
    raise exception 'FAIL: se permitió escribir en el chat ajeno.';
  exception when insufficient_privilege then null; end;
  begin
    perform user_id from public.admin_users;
    raise exception 'FAIL: se permitió leer los roles de administración.';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated','public.audit_request()','execute') then
    raise exception 'FAIL: función de auditoría expuesta.';
  end if;
end $$;

insert into public.messages(user_id,sender_id,body)
values(current_setting('test.uid_a')::uuid,current_setting('test.uid_a')::uuid,'Consulta: SELECT * FROM public.admin_users; O''Neill');

do $$ begin
  begin
    perform public.create_withdrawal('10','Nombre Apellido','0123456789012345678901',null);
    raise exception 'FAIL: se permitió un segundo retiro en 24 horas.';
  exception when raise_exception then
    if sqlerrm <> 'Solo podés solicitar un retiro cada 24 horas.' then raise; end if;
  end;
  begin
    insert into public.messages(user_id,sender_id,body)
      values(current_setting('test.uid_a')::uuid,current_setting('test.uid_a')::uuid,'Hola'||chr(1));
    raise exception 'FAIL: se aceptó un carácter de control.';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.messages(user_id,sender_id,body)
      values(current_setting('test.uid_a')::uuid,current_setting('test.uid_a')::uuid,E'\n\t');
    raise exception 'FAIL: se aceptó un mensaje vacío.';
  exception when invalid_parameter_value then null; end;
  for n in 1..19 loop
    insert into public.messages(user_id,sender_id,body)
      values(current_setting('test.uid_a')::uuid,current_setting('test.uid_a')::uuid,'Prueba de límite '||n);
  end loop;
  begin
    insert into public.messages(user_id,sender_id,body)
      values(current_setting('test.uid_a')::uuid,current_setting('test.uid_a')::uuid,'Mensaje 21');
    raise exception 'FAIL: no se aplicó el límite del chat.';
  exception when raise_exception then
    if sqlerrm <> 'Alcanzaste el límite de mensajes. Esperá un minuto.' then raise; end if;
  end;
end $$;

-- User B must not see A through either the table or the security-invoker view.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.uid_b'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.uid_b'),true);
do $$ begin
  if exists(select 1 from public.requests where id = current_setting('test.request_a')::uuid)
    or exists(select 1 from public.request_summaries where id = current_setting('test.request_a')::uuid)
    or exists(select 1 from public.messages where user_id = current_setting('test.uid_a')::uuid) then
    raise exception 'FAIL: un usuario puede leer datos de otro.';
  end if;
end $$;

-- Admin can review, but cannot rewrite amounts or banking information.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.uid_admin'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.uid_admin'),true);
do $$ declare changed integer; begin
  update public.requests set status = 'approved' where id = current_setting('test.request_a')::uuid;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'FAIL: el administrador no puede revisar la solicitud.'; end if;
  if not exists(select 1 from public.request_events where request_id = current_setting('test.request_a')::uuid
    and actor_id = current_setting('test.uid_admin')::uuid and new_status = 'approved') then
    raise exception 'FAIL: falta la auditoría de aprobación.';
  end if;
  begin
    update public.requests set amount = 999999 where id = current_setting('test.request_a')::uuid;
    raise exception 'FAIL: se permitió modificar el monto.';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.uid_a'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.uid_a'),true);
do $$ declare changed integer; begin
  update public.requests set status = 'rejected' where id = current_setting('test.request_a')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: el usuario puede cambiar estados.'; end if;
end $$;

set local role anon;
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
do $$ begin
  begin
    perform id from public.request_summaries;
    raise exception 'FAIL: se pueden leer solicitudes sin autenticación.';
  exception when insufficient_privilege then null; end;
  begin
    perform id from public.messages;
    raise exception 'FAIL: se pueden leer chats sin autenticación.';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
-- Si se ejecuta hasta aquí sin FAIL, los controles comprobados pasaron.
