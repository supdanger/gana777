-- Encuadre del banner de bonos, independiente para cada tema del portal.
begin;

alter table public.app_settings
  add column home_bonus_layouts jsonb not null default '{}'::jsonb,
  add constraint home_bonus_layouts_object check (jsonb_typeof(home_bonus_layouts) = 'object');

create function public.guard_home_bonus_layouts() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.home_bonus_layouts is distinct from old.home_bonus_layouts
    and not public.is_super_admin() then
    raise exception 'Solo un superadministrador puede cambiar el encuadre del banner de bonos.';
  end if;
  return new;
end; $$;

create trigger guard_home_bonus_layouts before update on public.app_settings
  for each row execute function public.guard_home_bonus_layouts();

commit;
