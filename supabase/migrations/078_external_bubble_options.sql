begin;
alter table public.app_settings
  add column external_chat_option_enabled boolean not null default true,
  add column external_charge_option_enabled boolean not null default true;

create function public.set_external_bubble_options(p_chat boolean, p_charge boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Solo el superadministrador puede configurar la burbuja.';
  end if;
  if p_chat is null or p_charge is null then raise exception 'Opciones inválidas.'; end if;
  update public.app_settings set external_chat_option_enabled = p_chat,
    external_charge_option_enabled = p_charge where id = true;
end;
$$;
revoke all on function public.set_external_bubble_options(boolean, boolean) from public, anon;
grant execute on function public.set_external_bubble_options(boolean, boolean) to authenticated;
commit;
