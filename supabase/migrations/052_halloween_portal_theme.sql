-- Tema Halloween con imágenes independientes para bonos, casino y logo.
begin;

alter table public.app_settings
  drop constraint portal_theme_valid;
alter table public.app_settings
  add constraint portal_theme_valid
  check (portal_theme in ('base', 'dark', 'christmas', 'new-year', 'halloween'));

alter table public.app_settings
  add column home_banner_halloween_path text,
  add column home_bonus_halloween_media_path text,
  add column portal_header_logo_halloween_path text,
  add constraint home_banner_halloween_path_valid check (
    home_banner_halloween_path is null or home_banner_halloween_path ~ '^home-banners/[0-9a-f-]{36}\.(jpg|png|webp)$'
  ),
  add constraint home_bonus_halloween_media_path_valid check (
    home_bonus_halloween_media_path is null or home_bonus_halloween_media_path ~ '^home-bonus/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$'
  ),
  add constraint portal_header_logo_halloween_path_valid check (
    portal_header_logo_halloween_path is null or portal_header_logo_halloween_path ~ '^header-logos/[0-9a-f-]{36}\.(jpg|png|webp)$'
  );

commit;
