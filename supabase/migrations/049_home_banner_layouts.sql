-- Ajustes de encuadre independientes para el botón «Ir al casino» por tema.
begin;

alter table public.app_settings
  add column home_banner_layouts jsonb not null default '{}'::jsonb,
  add constraint home_banner_layouts_object check (jsonb_typeof(home_banner_layouts) = 'object');

commit;
