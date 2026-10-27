begin;

alter table public.app_settings
  add column external_chat_enabled boolean not null default true;

create or replace function public.set_external_chat_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_admin_permission('chat') then
    raise exception using errcode = '42501', message = 'No tenés permiso para configurar el chat.';
  end if;

  update public.app_settings
    set external_chat_enabled = coalesce(p_enabled, false)
    where id = true;

  return coalesce((select s.external_chat_enabled from public.app_settings s where s.id = true), false);
end;
$$;

revoke all on function public.set_external_chat_enabled(boolean) from public, anon;
grant execute on function public.set_external_chat_enabled(boolean) to authenticated;

commit;
