-- Huella del celular. Sobrevive a borrar los datos del navegador y no usa la red.
begin;

alter table public.player_access_requests
  add column if not exists footprint_hash text;

alter table public.player_access_requests
  drop constraint if exists player_access_requests_footprint_hash_check;

alter table public.player_access_requests
  add constraint player_access_requests_footprint_hash_check
  check (footprint_hash is null or footprint_hash ~ '^[a-f0-9]{64}$');

create index if not exists player_access_requests_footprint_created
  on public.player_access_requests(footprint_hash, created_at desc)
  where footprint_hash is not null;

commit;
