begin;

-- La URL puede contener un enlace de acceso personal: solo la lee su dueño.
create table public.player_casino_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  url text not null unique check (
    length(url) <= 2048 and url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.player_casino_links enable row level security;
revoke all on public.player_casino_links from public, anon, authenticated;
grant select on public.player_casino_links to authenticated;
grant all on public.player_casino_links to service_role;
create policy player_casino_link_read on public.player_casino_links for select to authenticated
  using (user_id = (select auth.uid()));

-- Mantiene la recomendación, el enlace y la aprobación en una sola transacción.
create function public.finalize_player_access_request(
  p_request_id uuid, p_user_id uuid, p_admin_id uuid, p_referrer_id uuid,
  p_password text, p_casino_url text
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
  if not found or access_request.status <> 'pending' then
    raise exception 'La solicitud ya fue procesada.' using errcode='40001';
  end if;
  insert into public.player_casino_links(user_id,url) values (p_user_id,p_casino_url);
  if p_referrer_id is not null then
    insert into public.player_referrals(referred_user_id,referrer_user_id,created_by)
    values (p_user_id,p_referrer_id,p_admin_id);
  end if;
  insert into public.player_access_messages(request_id,sender,body)
  values (p_request_id,'admin',
    '¡Tu acceso está listo!' || chr(10) ||
    'Usuario: ' || access_request.username || chr(10) ||
    'Contraseña: ' || p_password || chr(10) ||
    'Ingresá en gana777bet.com con estos datos. Desde el inicio podrás abrir tu casino con el banner «Ir al casino».');
  update public.player_access_requests
    set status='approved',player_user_id=p_user_id,updated_at=now()
    where id=p_request_id;
end;
$$;
revoke all on function public.finalize_player_access_request(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.finalize_player_access_request(uuid,uuid,uuid,uuid,text,text) to service_role;

commit;
