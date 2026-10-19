-- Cajeros con acceso por apartado. Los administradores existentes pasan a ser
-- superadministradores; los cajeros nuevos se crean únicamente desde la Edge Function.
begin;

alter table public.admin_users add column if not exists is_super_admin boolean not null default false;
update public.admin_users set is_super_admin = true;

create table public.cashier_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  display_name text not null check (length(display_name) between 1 and 80),
  avatar_path text check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/avatar\.(jpg|jpeg|png|webp)$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index cashier_username_unique on public.cashier_profiles(lower(username));

create table public.admin_permissions (
  user_id uuid primary key references public.cashier_profiles(user_id) on delete cascade,
  home boolean not null default true,
  deposit boolean not null default false,
  withdrawal boolean not null default false,
  history boolean not null default false,
  users boolean not null default false,
  bonuses boolean not null default false,
  accounts boolean not null default false,
  shifts boolean not null default false,
  chat boolean not null default false,
  updated_at timestamptz not null default now()
);

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_users where user_id = (select auth.uid()) and is_super_admin);
$$;
revoke all on function public.is_super_admin() from public,anon,authenticated;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.admin_users a
    left join public.cashier_profiles c on c.user_id = a.user_id
    where a.user_id = (select auth.uid()) and (a.is_super_admin or c.active)
  );
$$;

create or replace function public.has_admin_permission(permission_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists(
    select 1 from public.cashier_profiles c
    join public.admin_permissions p on p.user_id = c.user_id
    where c.user_id = (select auth.uid()) and c.active and case permission_name
      when 'home' then p.home when 'deposit' then p.deposit when 'withdrawal' then p.withdrawal
      when 'history' then p.history when 'users' then p.users when 'bonuses' then p.bonuses
      when 'accounts' then p.accounts when 'shifts' then p.shifts when 'chat' then p.chat
      else false end
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
    case when public.is_super_admin() then jsonb_build_object('home',true,'deposit',true,'withdrawal',true,'history',true,'users',true,'bonuses',true,'accounts',true,'shifts',true,'chat',true)
    else jsonb_build_object('home',coalesce(p.home,false),'deposit',coalesce(p.deposit,false),'withdrawal',coalesce(p.withdrawal,false),
      'history',coalesce(p.history,false),'users',coalesce(p.users,false),'bonuses',coalesce(p.bonuses,false),
      'accounts',coalesce(p.accounts,false),'shifts',coalesce(p.shifts,false),'chat',coalesce(p.chat,false)) end
  from (select 1) seed
  left join public.cashier_profiles c on c.user_id = auth.uid()
  left join public.admin_permissions p on p.user_id = c.user_id;
$$;
revoke all on function public.get_admin_context() from public,anon,authenticated;
grant execute on function public.get_admin_context() to authenticated;

alter table public.cashier_profiles enable row level security;
alter table public.admin_permissions enable row level security;
revoke all on public.cashier_profiles,public.admin_permissions from public,anon,authenticated;
grant select on public.cashier_profiles,public.admin_permissions to authenticated;
grant update(display_name,avatar_path,active,updated_at) on public.cashier_profiles to authenticated;
grant update(home,deposit,withdrawal,history,users,bonuses,accounts,shifts,chat,updated_at) on public.admin_permissions to authenticated;
create policy cashier_profiles_read on public.cashier_profiles for select to authenticated using (user_id = auth.uid() or public.is_super_admin());
create policy cashier_profiles_update on public.cashier_profiles for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy admin_permissions_read on public.admin_permissions for select to authenticated using (user_id = auth.uid() or public.is_super_admin());
create policy admin_permissions_update on public.admin_permissions for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create or replace view public.cashier_directory with (security_invoker = true) as
select c.user_id,c.username,c.display_name,c.avatar_path,c.active,c.created_at,
  p.home,p.deposit,p.withdrawal,p.history,p.users,p.bonuses,p.accounts,p.shifts,p.chat
from public.cashier_profiles c join public.admin_permissions p on p.user_id = c.user_id;
revoke all on public.cashier_directory from public,anon,authenticated;
grant select on public.cashier_directory to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('cashier-avatars','cashier-avatars',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy cashier_avatar_read on storage.objects for select to anon,authenticated using (bucket_id='cashier-avatars');
create policy cashier_avatar_insert on storage.objects for insert to authenticated with check (bucket_id='cashier-avatars' and public.is_super_admin());
create policy cashier_avatar_update on storage.objects for update to authenticated using (bucket_id='cashier-avatars' and public.is_super_admin()) with check (bucket_id='cashier-avatars' and public.is_super_admin());
create policy cashier_avatar_delete on storage.objects for delete to authenticated using (bucket_id='cashier-avatars' and public.is_super_admin());

-- Las políticas aplican el mismo permiso que la navegación del panel.
drop policy if exists request_read on public.requests;
create policy request_read on public.requests for select to authenticated using (
  user_id=auth.uid() or public.has_admin_permission('home') or public.has_admin_permission('history') or public.has_admin_permission('users')
  or (kind='deposit' and public.has_admin_permission('deposit')) or (kind='withdrawal' and public.has_admin_permission('withdrawal'))
);
drop policy if exists security_request_scope on public.requests;
create policy security_request_scope on public.requests as restrictive for all to authenticated using (
  user_id=auth.uid() or public.has_admin_permission('home') or public.has_admin_permission('history') or public.has_admin_permission('users')
  or (kind='deposit' and public.has_admin_permission('deposit')) or (kind='withdrawal' and public.has_admin_permission('withdrawal'))
) with check (user_id=auth.uid() or public.is_admin());
drop policy if exists request_review on public.requests;
create policy request_review on public.requests for update to authenticated using (
  status='pending' and ((kind='deposit' and public.has_admin_permission('deposit')) or (kind='withdrawal' and public.has_admin_permission('withdrawal')))
) with check (status in ('approved','rejected'));
drop policy if exists security_request_review on public.requests;
create policy security_request_review on public.requests as restrictive for update to authenticated using (
  status='pending' and ((kind='deposit' and public.has_admin_permission('deposit')) or (kind='withdrawal' and public.has_admin_permission('withdrawal')))
) with check (status in ('approved','rejected'));

drop policy if exists message_read on public.messages;
create policy message_read on public.messages for select to authenticated using (user_id=auth.uid() or public.has_admin_permission('chat') or public.has_admin_permission('users'));
drop policy if exists security_message_scope on public.messages;
create policy security_message_scope on public.messages as restrictive for all to authenticated
using (user_id=auth.uid() or public.has_admin_permission('chat') or public.has_admin_permission('users'))
with check (sender_id=auth.uid() and (user_id=auth.uid() or public.has_admin_permission('chat')));
drop policy if exists message_send on public.messages;
create policy message_send on public.messages for insert to authenticated with check (sender_id=auth.uid() and (user_id=auth.uid() or public.has_admin_permission('chat')));

drop policy if exists user_profile_read on public.user_profiles;
create policy user_profile_read on public.user_profiles for select to authenticated using (
  user_id=auth.uid() or public.has_admin_permission('home') or public.has_admin_permission('deposit') or public.has_admin_permission('withdrawal')
  or public.has_admin_permission('history') or public.has_admin_permission('users') or public.has_admin_permission('chat')
);
drop policy if exists promotions_admin_read on public.promotions;
create policy promotions_admin_read on public.promotions for select to authenticated using (public.has_admin_permission('bonuses') or public.has_admin_permission('home'));
drop policy if exists promotions_admin_write on public.promotions;
create policy promotions_admin_write on public.promotions for all to authenticated using (public.has_admin_permission('bonuses')) with check (public.has_admin_permission('bonuses'));

drop policy if exists bank_admin_read on public.bank_accounts;
drop policy if exists bank_admin_insert on public.bank_accounts;
drop policy if exists bank_admin_update on public.bank_accounts;
drop policy if exists bank_admin_delete on public.bank_accounts;
create policy bank_admin_read on public.bank_accounts for select to authenticated using (active or public.has_admin_permission('accounts') or public.has_admin_permission('shifts'));
create policy bank_admin_insert on public.bank_accounts for insert to authenticated with check (public.has_admin_permission('accounts'));
create policy bank_admin_update on public.bank_accounts for update to authenticated using (public.has_admin_permission('accounts')) with check (public.has_admin_permission('accounts'));
create policy bank_admin_delete on public.bank_accounts for delete to authenticated using (public.has_admin_permission('accounts'));
drop policy if exists shifts_admin_read on public.work_shifts;
drop policy if exists shifts_admin_update on public.work_shifts;
create policy shifts_admin_read on public.work_shifts for select to authenticated using (public.has_admin_permission('accounts') or public.has_admin_permission('shifts'));
create policy shifts_admin_update on public.work_shifts for update to authenticated using (public.has_admin_permission('shifts')) with check (public.has_admin_permission('shifts'));
drop policy if exists assignments_admin_read on public.bank_account_assignments;
create policy assignments_admin_read on public.bank_account_assignments for select to authenticated using (user_id=auth.uid() or public.has_admin_permission('accounts') or public.has_admin_permission('deposit'));

-- Los cambios operativos de turno también verifican el permiso, no solamente el menú.
create or replace function public.start_cash_close(p_minutes integer,p_next_shift text)
returns setof public.bank_operation_state
language plpgsql security definer set search_path = '' as $$
declare outgoing text;
begin
  if auth.uid() is null or not public.has_admin_permission('shifts') then raise exception using errcode='42501',message='Operación no permitida.'; end if;
  if p_minutes < 1 or p_minutes > 10 then raise exception using errcode='22023',message='El cierre debe durar entre 1 y 10 minutos.'; end if;
  if p_next_shift not in ('morning','afternoon','night') then raise exception using errcode='22023',message='Turno no válido.'; end if;
  perform pg_advisory_xact_lock(777011);
  select key into outgoing from public.work_shifts where active limit 1;
  update public.bank_account_assignments set status='expired' where status='reserved';
  update public.work_shifts set active=false,updated_at=now() where active;
  update public.bank_operation_state as state set mode='closing',outgoing_shift_key=outgoing,
    next_shift_key=p_next_shift,resumes_at=now()+make_interval(mins=>p_minutes),updated_at=now() where state.id;
  return query select * from public.bank_operation_state;
end $$;

create or replace function public.start_bank_maintenance()
returns setof public.bank_operation_state
language plpgsql security definer set search_path = '' as $$
declare outgoing text;
begin
  if auth.uid() is null or not public.has_admin_permission('shifts') then raise exception using errcode='42501',message='Operación no permitida.'; end if;
  perform pg_advisory_xact_lock(777011);
  select coalesce((select key from public.work_shifts where active limit 1),
    (select state.outgoing_shift_key from public.bank_operation_state state where state.id)) into outgoing;
  update public.bank_account_assignments set status='expired' where status='reserved';
  update public.work_shifts set active=false,updated_at=now() where active;
  update public.bank_operation_state as state set mode='maintenance',outgoing_shift_key=outgoing,
    next_shift_key=null,resumes_at=null,updated_at=now() where state.id;
  return query select * from public.bank_operation_state;
end $$;

create or replace function public.set_active_shift(p_shift text)
returns setof public.work_shifts
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_admin_permission('shifts') then raise exception using errcode='42501',message='Operación no permitida.'; end if;
  if p_shift not in ('morning','afternoon','night') then raise exception using errcode='22023',message='Turno no válido.'; end if;
  perform pg_advisory_xact_lock(777011);
  update public.work_shifts set active=false,updated_at=now() where active;
  update public.work_shifts set active=true,updated_at=now() where key=p_shift;
  update public.bank_operation_state as state set mode='online',outgoing_shift_key=null,
    next_shift_key=null,resumes_at=null,updated_at=now() where state.id;
  return query select s.* from public.work_shifts s order by case s.key when 'morning' then 1 when 'afternoon' then 2 else 3 end;
end $$;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='admin_permissions') then
    alter publication supabase_realtime add table public.admin_permissions;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cashier_profiles') then
    alter publication supabase_realtime add table public.cashier_profiles;
  end if;
end $$;

commit;
