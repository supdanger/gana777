-- Enlace visual del inicio. Reutiliza el permiso Contactos para editar contenido.
begin;
alter table public.app_settings
  add column home_banner_enabled boolean not null default false,
  add column home_banner_title text not null default 'Visitar página',
  add column home_banner_url text,
  add column home_banner_path text,
  add constraint home_banner_title_valid check (length(btrim(home_banner_title)) between 1 and 80),
  add constraint home_banner_url_valid check (
    home_banner_url is null or (length(home_banner_url) <= 2048 and home_banner_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$')
  ),
  add constraint home_banner_path_valid check (
    home_banner_path is null or home_banner_path ~ '^home-banners/[0-9a-f-]{36}\.(jpg|png|webp)$'
  ),
  add constraint home_banner_ready check (
    not home_banner_enabled or (home_banner_url is not null and home_banner_path is not null)
  );

-- No amplía permisos sobre otras imágenes: solo permite subir banners nuevos.
create policy home_banner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-assets' and name ~ '^home-banners/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and public.has_admin_permission('contacts')
  );
-- app_settings ya tiene lectura pública y edición con permiso contacts (017).
commit;
