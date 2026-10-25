-- Imagen y encuadre del logo del encabezado del portal de jugadores.
begin;

alter table public.app_settings
  add column portal_header_logo_path text,
  add column portal_header_logo_layouts jsonb not null default '{}'::jsonb,
  add constraint portal_header_logo_path_valid check (
    portal_header_logo_path is null or portal_header_logo_path ~ '^header-logos/[0-9a-f-]{36}\.(jpg|png|webp)$'
  ),
  add constraint portal_header_logo_layouts_object check (jsonb_typeof(portal_header_logo_layouts) = 'object');

create policy portal_header_logo_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-assets'
    and name ~ '^header-logos/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and public.has_admin_permission('contacts')
  );

commit;
