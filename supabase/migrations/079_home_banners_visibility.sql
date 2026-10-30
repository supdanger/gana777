begin;
alter table public.app_settings add column home_banners_visible boolean not null default true;

create function public.guard_home_banners_visibility() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.home_banners_visible is distinct from old.home_banners_visible and not public.is_super_admin() then
    raise exception 'Solo un superadministrador puede cambiar la visibilidad de los banners.';
  end if;
  return new;
end;
$$;
create trigger guard_home_banners_visibility before update on public.app_settings
for each row execute function public.guard_home_banners_visibility();

create function public.set_home_banners_visible(p_visible boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Solo un superadministrador puede configurar los banners.';
  end if;
  if p_visible is null then raise exception 'Estado inválido.'; end if;
  update public.app_settings set home_banners_visible = p_visible where id = true;
end;
$$;
revoke all on function public.set_home_banners_visible(boolean) from public, anon;
grant execute on function public.set_home_banners_visible(boolean) to authenticated;
commit;
