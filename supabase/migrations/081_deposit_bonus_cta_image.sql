begin;
alter table public.app_settings add column deposit_bonus_button_path text;
alter table public.app_settings add constraint deposit_bonus_button_path_valid check (
  deposit_bonus_button_path is null or deposit_bonus_button_path ~ '^bonus-cta/[0-9a-f-]{36}\.(jpg|png|webp)$'
);
drop policy if exists bonus_cta_image_insert on storage.objects;
create policy bonus_cta_image_insert on storage.objects for insert to authenticated
  with check (bucket_id='app-assets' and name ~ '^bonus-cta/[0-9a-f-]{36}\.(jpg|png|webp)$' and public.has_admin_permission('bonuses'));
do $$
declare definition text;
  old_branch text := $old$    elsif changed_key in (
      'portal_theme','portal_theme_designs','home_bonus_media_path',
      'home_bonus_halloween_media_path','home_bonus_layouts','portal_banners'
    ) then
      if not public.has_admin_permission('themes') then
        raise exception using errcode='42501', message='No tenés permiso para editar Temas.';
      end if;$old$;
  new_branch text := $new$    elsif changed_key = 'deposit_bonus_button_path' then
      if not public.has_admin_permission('bonuses') then
        raise exception using errcode='42501', message='No tenés permiso para editar Bonos.';
      end if;
    elsif changed_key in (
      'portal_theme','portal_theme_designs','home_bonus_media_path',
      'home_bonus_halloween_media_path','home_bonus_layouts','portal_banners'
    ) then
      if not public.has_admin_permission('themes') then
        raise exception using errcode='42501', message='No tenés permiso para editar Temas.';
      end if;$new$;
begin
  select pg_get_functiondef('public.guard_app_settings_page_permissions()'::regprocedure) into definition;
  if position(old_branch in definition)=0 then raise exception 'No se pudo extender la validación de permisos de configuración.'; end if;
  execute replace(definition,old_branch,new_branch);
end $$;

commit;
