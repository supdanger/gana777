-- Tema global del portal de jugadores. Los temas futuros se habilitarán al implementarlos.
begin;

alter table public.app_settings
  add column portal_theme text not null default 'base'
  check (portal_theme in ('base', 'dark'));

create function public.guard_portal_theme() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.portal_theme is distinct from old.portal_theme
    and not public.is_super_admin() then
    raise exception 'Solo un superadministrador puede cambiar el tema del portal.';
  end if;
  return new;
end; $$;
create trigger guard_portal_theme before update on public.app_settings
  for each row execute function public.guard_portal_theme();

commit;
