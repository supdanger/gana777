-- Habilita los temas estacionales sin cambiar el tema activo.
begin;

do $$ declare constraint_name text; begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.app_settings'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%portal_theme%'
  loop
    execute format('alter table public.app_settings drop constraint %I', constraint_name);
  end loop;
end $$;
alter table public.app_settings
  add constraint portal_theme_valid
  check (portal_theme in ('base', 'dark', 'christmas', 'new-year'));

commit;
