-- Diseños por tema y temas personalizados creados desde el panel.
begin;

alter table public.app_settings
  add column portal_theme_designs jsonb not null default '{}'::jsonb,
  add constraint portal_theme_designs_object check (jsonb_typeof(portal_theme_designs) = 'object'),
  add constraint portal_theme_designs_size check (octet_length(portal_theme_designs::text) <= 200000);

alter table public.app_settings drop constraint portal_theme_valid;
alter table public.app_settings add constraint portal_theme_valid check (
  portal_theme in ('base', 'dark', 'christmas', 'new-year', 'halloween')
  or (portal_theme ~ '^custom-[0-9a-f-]{36}$' and portal_theme_designs ? portal_theme)
);

create function public.guard_portal_theme_designs() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.portal_theme_designs is distinct from old.portal_theme_designs
    and not public.is_super_admin() then
    raise exception 'Solo un superadministrador puede editar los temas del portal.';
  end if;
  return new;
end; $$;
create trigger guard_portal_theme_designs before update on public.app_settings
  for each row execute function public.guard_portal_theme_designs();

create policy portal_theme_background_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-assets'
    and name ~ '^theme-backgrounds/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and public.is_super_admin()
  );

commit;
