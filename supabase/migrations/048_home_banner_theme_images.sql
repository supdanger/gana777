-- Una imagen opcional para el botón «Ir al casino» en cada tema.
-- La imagen base, el enlace y el estado del botón siguen siendo compartidos.
begin;

alter table public.app_settings
  add column home_banner_dark_path text,
  add column home_banner_christmas_path text,
  add column home_banner_new_year_path text,
  add constraint home_banner_dark_path_valid check (
    home_banner_dark_path is null or home_banner_dark_path ~ '^home-banners/[0-9a-f-]{36}\.(jpg|png|webp)$'
  ),
  add constraint home_banner_christmas_path_valid check (
    home_banner_christmas_path is null or home_banner_christmas_path ~ '^home-banners/[0-9a-f-]{36}\.(jpg|png|webp)$'
  ),
  add constraint home_banner_new_year_path_valid check (
    home_banner_new_year_path is null or home_banner_new_year_path ~ '^home-banners/[0-9a-f-]{36}\.(jpg|png|webp)$'
  );

commit;
