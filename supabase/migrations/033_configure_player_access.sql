begin;

-- Completa solicitudes aprobadas antes de que existieran los enlaces personales.
create function public.configure_player_access_request(
  p_request_id uuid, p_password text, p_casino_url text
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
  insert into public.player_access_messages(request_id,sender,body)
  values (p_request_id,'admin',
    'Tus datos de acceso se actualizaron.' || chr(10) ||
    'Usuario: ' || access_request.username || chr(10) ||
    'Contraseña: ' || p_password || chr(10) ||
    'Ingresá en gana777bet.com con estos datos. Desde el inicio podrás abrir tu casino con el banner «Ir al casino».');
  update public.player_access_requests set updated_at=now() where id=p_request_id;
end;
$$;
revoke all on function public.configure_player_access_request(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.configure_player_access_request(uuid,text,text) to service_role;

commit;
