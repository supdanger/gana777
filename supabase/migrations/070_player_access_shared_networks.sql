begin;

-- Permite varias solicitudes pendientes desde el mismo dispositivo o red.
drop index if exists public.player_access_requests_one_open_device;

-- Las solicitudes anteriormente bloqueadas pueden volver a revisarse y aprobarse.
update public.player_access_requests
set ip_blocked = false,
    matched_request_id = null,
    matched_username = null
where ip_blocked = true;

commit;
