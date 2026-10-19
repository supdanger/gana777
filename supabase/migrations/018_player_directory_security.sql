-- Permite excluir cuentas del panel sin conceder acceso directo a admin_users.
begin;

create or replace function public.is_panel_user(target_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_users a where a.user_id = target_user_id);
$$;
revoke all on function public.is_panel_user(uuid) from public,anon,authenticated;
grant execute on function public.is_panel_user(uuid) to authenticated;

drop view if exists public.player_directory;
create view public.player_directory with (security_invoker = true) as
select p.user_id,p.username,p.display_name,p.phone,p.external_user_id,p.whatsapp_principal_slot,
  w.phone as whatsapp_principal_phone,p.created_at,p.updated_at,
  coalesce((select count(*) from public.requests r where r.user_id=p.user_id and r.kind='deposit'),0) as deposits,
  coalesce((select count(*) from public.requests r where r.user_id=p.user_id and r.kind='withdrawal'),0) as withdrawals
from public.user_profiles p
left join public.whatsapp_principals w on w.slot=p.whatsapp_principal_slot
where not public.is_panel_user(p.user_id);
revoke all on public.player_directory from public,anon,authenticated;
grant select on public.player_directory to authenticated;

commit;
