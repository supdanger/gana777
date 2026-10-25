-- Banners extra del inicio y banners de la pantalla de retiros, por tema.
begin;

alter table public.app_settings
  add column portal_banners jsonb not null default '[]'::jsonb,
  add constraint portal_banners_array check (jsonb_typeof(portal_banners) = 'array');

create function public.guard_portal_banners() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.portal_banners is distinct from old.portal_banners
    and not public.is_super_admin() then
    raise exception 'Solo un superadministrador puede cambiar los banners del portal.';
  end if;
  return new;
end; $$;

create trigger guard_portal_banners before update on public.app_settings
  for each row execute function public.guard_portal_banners();

create policy portal_banners_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-assets'
    and name ~ '^portal-banners/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$'
    and public.is_super_admin()
  );

commit;
