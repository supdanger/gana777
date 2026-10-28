begin;

-- El mismo dispositivo puede tener una sola solicitud abierta.
create unique index if not exists player_access_requests_one_open_device
  on public.player_access_requests(device_hash)
  where status = 'pending';

-- Y puede completar como máximo una cuenta desde el portal.
create unique index if not exists player_access_requests_one_approved_device
  on public.player_access_requests(device_hash)
  where status = 'approved' and player_user_id is not null;

commit;
