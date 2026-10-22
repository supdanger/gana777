begin;

-- El RPC del servidor necesita insertar un mensaje en nombre del administrador.
-- Solo ese RPC y solo con la clave service_role pueden usar esta excepción.
create or replace function public.guard_message_input() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  platform_password_notice boolean := coalesce(auth.role() = 'service_role'
    and current_setting('app.platform_password_notice', true) = 'on', false);
begin
  if not platform_password_notice and
    (actor is null or new.sender_id <> actor or (new.user_id <> actor and not public.is_admin())) then
    raise exception using errcode = '42501', message = 'Operación no permitida.';
  end if;
  new.body := btrim(new.body);
  if new.body is null or length(new.body) not between 1 and 2000 or new.body !~ '[^[:space:]]'
    or regexp_replace(new.body, E'[\n\r\t]', '', 'g') ~ '[[:cntrl:]]'
    or new.body ~ U&'[\200B-\200F\202A-\202E\2060-\206F\FEFF]' then
    raise exception using errcode = '22023', message = 'Mensaje no válido.';
  end if;
  if not platform_password_notice then
    perform pg_advisory_xact_lock(hashtextextended(actor::text, 2));
    if (select count(*) from public.messages where sender_id = actor and created_at > now() - interval '1 minute') >= 20 then
      raise exception 'Alcanzaste el límite de mensajes. Esperá un minuto.';
    end if;
  end if;
  new.created_at := now();
  return new;
end $$;

create or replace function public.configure_player_access_request(
  p_request_id uuid, p_admin_id uuid, p_password text, p_casino_url text
) returns void
language plpgsql security definer set search_path = '' as $$
declare access_request public.player_access_requests%rowtype;
begin
  if length(p_password) < 8 or length(p_password) > 72 then
    raise exception 'Contraseña no válida.' using errcode='22023';
  end if;
  if p_casino_url is null or length(p_casino_url) > 2048 or
     p_casino_url !~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$' then
    raise exception 'URL personal no válida.' using errcode='22023';
  end if;
  select * into access_request from public.player_access_requests where id=p_request_id for update;
  if not found or access_request.status <> 'approved' or access_request.player_user_id is null then
    raise exception 'La solicitud no tiene una cuenta creada.' using errcode='22023';
  end if;
  insert into public.player_casino_links(user_id,url) values (access_request.player_user_id,p_casino_url)
    on conflict (user_id) do update set url=excluded.url,updated_at=now();
  perform set_config('app.platform_password_notice', 'on', true);
  insert into public.messages(user_id,sender_id,body)
  values (access_request.player_user_id,p_admin_id,
    'Tus datos de acceso se actualizaron.' || chr(10) ||
    'Usuario: ' || access_request.username || chr(10) ||
    'Contraseña: ' || p_password || chr(10) ||
    'Ingresá en gana777bet.com con estos datos. Desde el inicio podrás abrir tu casino con el banner «Ir al casino».');
  perform set_config('app.platform_password_notice', 'off', true);
  update public.player_access_requests set updated_at=now() where id=p_request_id;
end;
$$;

commit;
