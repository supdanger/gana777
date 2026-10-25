-- La misma red ya no bloquea otra cuenta. Solo sigue bloqueado el mismo celular.
begin;

update public.player_access_requests as request
set ip_blocked = false,
    matched_request_id = null,
    matched_username = null
from public.player_access_requests as matched
where request.matched_request_id = matched.id
  and request.ip_blocked = true
  and request.status = 'pending'
  and request.device_hash <> matched.device_hash;

commit;
