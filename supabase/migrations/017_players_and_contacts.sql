-- Directorio de jugadores y enrutamiento de WhatsApp por principal.
begin;

alter table public.admin_permissions add column if not exists contacts boolean not null default false;

create or replace function public.has_admin_permission(permission_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists(
    select 1 from public.cashier_profiles c
    join public.admin_permissions p on p.user_id = c.user_id
    where c.user_id = (select auth.uid()) and c.active and case permission_name
      when 'home' then p.home when 'deposit' then p.deposit when 'withdrawal' then p.withdrawal
      when 'history' then p.history when 'users' then p.users when 'contacts' then p.contacts
      when 'bonuses' then p.bonuses when 'accounts' then p.accounts when 'shifts' then p.shifts
      when 'chat' then p.chat else false end
  );
$$;
revoke all on function public.has_admin_permission(text) from public,anon,authenticated;
grant execute on function public.has_admin_permission(text) to authenticated;

create or replace function public.get_admin_context()
returns table(is_admin boolean,is_super_admin boolean,username text,display_name text,avatar_path text,permissions jsonb)
language sql stable security definer set search_path = '' as $$
  select public.is_admin(), public.is_super_admin(), c.username,
    coalesce(c.display_name, nullif((select raw_user_meta_data->>'display_name' from auth.users where id = auth.uid()),''),
      nullif(split_part((select email from auth.users where id = auth.uid()),'@',1),''),'Administrador'),
    c.avatar_path,
    case when public.is_super_admin() then jsonb_build_object(
      'home',true,'deposit',true,'withdrawal',true,'history',true,'users',true,'contacts',true,
      'bonuses',true,'accounts',true,'shifts',true,'chat',true)
    else jsonb_build_object(
      'home',coalesce(p.home,false),'deposit',coalesce(p.deposit,false),'withdrawal',coalesce(p.withdrawal,false),
      'history',coalesce(p.history,false),'users',coalesce(p.users,false),'contacts',coalesce(p.contacts,false),
      'bonuses',coalesce(p.bonuses,false),'accounts',coalesce(p.accounts,false),
      'shifts',coalesce(p.shifts,false),'chat',coalesce(p.chat,false)) end
  from (select 1) seed
  left join public.cashier_profiles c on c.user_id = auth.uid()
  left join public.admin_permissions p on p.user_id = c.user_id;
$$;
revoke all on function public.get_admin_context() from public,anon,authenticated;
grant execute on function public.get_admin_context() to authenticated;

grant update(contacts) on public.admin_permissions to authenticated;
drop view if exists public.cashier_directory;
create view public.cashier_directory with (security_invoker = true) as
select c.user_id,c.username,c.display_name,c.avatar_path,c.active,c.created_at,
  p.home,p.deposit,p.withdrawal,p.history,p.users,p.contacts,p.bonuses,p.accounts,p.shifts,p.chat
from public.cashier_profiles c join public.admin_permissions p on p.user_id = c.user_id;
revoke all on public.cashier_directory from public,anon,authenticated;
grant select on public.cashier_directory to authenticated;

-- Puede existir si la estructura se creó previamente desde el SQL Editor.
-- IF NOT EXISTS permite reconciliarla con el historial de migraciones sin
-- borrar los principales ni sus asignaciones.
create table if not exists public.whatsapp_principals (
  slot smallint primary key check (slot between 1 and 50),
  phone text not null unique check (phone ~ '^[1-9][0-9]{7,14}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists username text,
  add column if not exists phone text,
  add column if not exists external_user_id text,
  add column if not exists whatsapp_principal_slot smallint references public.whatsapp_principals(slot) on update cascade on delete restrict,
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_profiles drop constraint if exists user_profiles_username_format;
alter table public.user_profiles add constraint user_profiles_username_format
  check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');
alter table public.user_profiles drop constraint if exists user_profiles_phone_format;
alter table public.user_profiles add constraint user_profiles_phone_format
  check (phone is null or phone ~ '^[1-9][0-9]{7,14}$');
alter table public.user_profiles drop constraint if exists user_profiles_external_id_length;
alter table public.user_profiles add constraint user_profiles_external_id_length
  check (external_user_id is null or length(external_user_id) between 1 and 80);
create unique index if not exists player_username_unique on public.user_profiles(lower(username)) where username is not null;
create unique index if not exists player_phone_unique on public.user_profiles(phone) where phone is not null;
create unique index if not exists player_external_id_unique on public.user_profiles(external_user_id) where external_user_id is not null;

alter table public.app_settings
  add column if not exists show_whatsapp boolean not null default true,
  add column if not exists show_telegram boolean not null default true,
  add column if not exists show_instagram boolean not null default true;

alter table public.whatsapp_principals enable row level security;
revoke all on public.whatsapp_principals from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_principals to authenticated;
drop policy if exists whatsapp_principals_read on public.whatsapp_principals;
drop policy if exists whatsapp_principals_insert on public.whatsapp_principals;
drop policy if exists whatsapp_principals_update on public.whatsapp_principals;
drop policy if exists whatsapp_principals_delete on public.whatsapp_principals;
create policy whatsapp_principals_read on public.whatsapp_principals for select to authenticated using (
  public.has_admin_permission('contacts') or public.has_admin_permission('users')
  or slot = (select p.whatsapp_principal_slot from public.user_profiles p where p.user_id = auth.uid())
);
create policy whatsapp_principals_insert on public.whatsapp_principals for insert to authenticated
  with check (public.has_admin_permission('contacts'));
create policy whatsapp_principals_update on public.whatsapp_principals for update to authenticated
  using (public.has_admin_permission('contacts')) with check (public.has_admin_permission('contacts'));
create policy whatsapp_principals_delete on public.whatsapp_principals for delete to authenticated
  using (public.has_admin_permission('contacts'));

drop policy if exists settings_edit on public.app_settings;
create policy settings_edit on public.app_settings for update to authenticated
  using (public.has_admin_permission('contacts')) with check (public.has_admin_permission('contacts'));

drop policy if exists user_profile_read on public.user_profiles;
create policy user_profile_read on public.user_profiles for select to authenticated using (
  user_id=auth.uid() or public.has_admin_permission('home') or public.has_admin_permission('deposit')
  or public.has_admin_permission('withdrawal') or public.has_admin_permission('history')
  or public.has_admin_permission('users') or public.has_admin_permission('chat')
);

create or replace view public.player_directory with (security_invoker = true) as
select p.user_id,p.username,p.display_name,p.phone,p.external_user_id,p.whatsapp_principal_slot,
  w.phone as whatsapp_principal_phone,p.created_at,p.updated_at,
  coalesce((select count(*) from public.requests r where r.user_id=p.user_id and r.kind='deposit'),0) as deposits,
  coalesce((select count(*) from public.requests r where r.user_id=p.user_id and r.kind='withdrawal'),0) as withdrawals
from public.user_profiles p
left join public.whatsapp_principals w on w.slot=p.whatsapp_principal_slot
where not exists(select 1 from public.admin_users a where a.user_id=p.user_id);
revoke all on public.player_directory from public,anon,authenticated;
grant select on public.player_directory to authenticated;

create or replace function public.get_my_whatsapp_url() returns text
language sql stable security definer set search_path = '' as $$
  select case when s.show_whatsapp and w.active then 'https://wa.me/' || w.phone else null end
  from public.app_settings s
  left join public.user_profiles p on p.user_id=auth.uid()
  left join public.whatsapp_principals w on w.slot=p.whatsapp_principal_slot
  where s.id=true;
$$;
revoke all on function public.get_my_whatsapp_url() from public,anon,authenticated;
grant execute on function public.get_my_whatsapp_url() to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='whatsapp_principals') then
    alter publication supabase_realtime add table public.whatsapp_principals;
  end if;
end $$;

commit;
