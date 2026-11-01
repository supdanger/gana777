-- Permite el tema Inicio moderno sin cambiar el tema activo.
begin;

alter table public.app_settings drop constraint portal_theme_valid;
alter table public.app_settings add constraint portal_theme_valid check (
  portal_theme in ('base', 'dark', 'christmas', 'new-year', 'halloween', 'modern')
  or (portal_theme ~ '^custom-[0-9a-f-]{36}$' and portal_theme_designs ? portal_theme)
);

drop policy if exists theme_card_image_insert on storage.objects;
create policy theme_card_image_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-assets'
    and name ~ '^theme-card-images/(base|dark|christmas|new-year|halloween|modern|custom-[0-9a-f-]{36})/[a-z0-9-]+-[0-9a-f-]{36}\.(jpg|png|webp)$'
    and public.has_admin_permission('themes')
  );

commit;
