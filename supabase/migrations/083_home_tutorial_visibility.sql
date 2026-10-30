begin;

alter table public.app_settings
  add column if not exists home_tutorial_enabled boolean not null default true;
alter table public.app_settings
  add column if not exists home_tutorial_first_login_enabled boolean not null default true;

do $$
declare
  definition text;
  old_branch text := $old$    elsif changed_key in (
      'portal_theme','portal_theme_designs','home_bonus_media_path',
      'home_bonus_halloween_media_path','home_bonus_layouts','portal_banners'
    ) then$old$;
  new_branch text := $new$    elsif changed_key in (
      'portal_theme','portal_theme_designs','home_bonus_media_path',
      'home_bonus_halloween_media_path','home_bonus_layouts','portal_banners',
      'home_tutorial_enabled','home_tutorial_first_login_enabled'
    ) then$new$;
begin
  select pg_get_functiondef('public.guard_app_settings_page_permissions()'::regprocedure)
    into definition;
  if position(old_branch in definition) = 0 then
    raise exception 'No se pudo extender la validación de permisos del tutorial.';
  end if;
  execute replace(definition, old_branch, new_branch);
end $$;

commit;
