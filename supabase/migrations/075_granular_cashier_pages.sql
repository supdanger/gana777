-- Cada apartado delegable del panel tiene su propio permiso. Los nuevos permisos
-- comienzan apagados para que los cajeros existentes no hereden accesos adicionales.
begin;

alter table public.admin_permissions
  add column if not exists external_chat boolean not null default false,
  add column if not exists access_requests boolean not null default false,
  add column if not exists platform boolean not null default false,
  add column if not exists referrals boolean not null default false,
  add column if not exists wheel boolean not null default false,
  add column if not exists portal boolean not null default false,
  add column if not exists announcements boolean not null default false,
  add column if not exists themes boolean not null default false,
  add column if not exists telegram boolean not null default false;

grant update(external_chat,access_requests,platform,referrals,wheel,portal,announcements,themes,telegram)
  on public.admin_permissions to authenticated;

create or replace function public.has_admin_permission(permission_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists(
    select 1 from public.cashier_profiles c
    join public.admin_permissions p on p.user_id = c.user_id
    where c.user_id = (select auth.uid()) and c.active and case permission_name
      when 'home' then p.home when 'deposit' then p.deposit when 'withdrawal' then p.withdrawal
      when 'history' then p.history when 'users' then p.users when 'contacts' then p.contacts
      when 'bonuses' then p.bonuses when 'accounts' then p.accounts when 'shifts' then p.shifts
      when 'chat' then p.chat when 'external_chat' then p.external_chat
      when 'access_requests' then p.access_requests when 'platform' then p.platform
      when 'referrals' then p.referrals when 'wheel' then p.wheel when 'portal' then p.portal
      when 'announcements' then p.announcements when 'themes' then p.themes when 'telegram' then p.telegram
      else false end
  );
$$;

create or replace function public.get_admin_context()
returns table(is_admin boolean,is_super_admin boolean,username text,display_name text,avatar_path text,permissions jsonb)
language sql stable security definer set search_path = '' as $$
  select public.is_admin(), public.is_super_admin(), c.username,
    coalesce(c.display_name, nullif((select raw_user_meta_data->>'display_name' from auth.users where id = auth.uid()),''),
      nullif(split_part((select email from auth.users where id = auth.uid()),'@',1),''),'Administrador'),
    c.avatar_path,
    case when public.is_super_admin() then jsonb_build_object(
      'home',true,'deposit',true,'withdrawal',true,'history',true,'users',true,'contacts',true,
      'bonuses',true,'accounts',true,'shifts',true,'chat',true,'external_chat',true,
      'access_requests',true,'platform',true,'referrals',true,'wheel',true,'portal',true,
      'announcements',true,'themes',true,'telegram',true)
    else jsonb_build_object(
      'home',coalesce(p.home,false),'deposit',coalesce(p.deposit,false),'withdrawal',coalesce(p.withdrawal,false),
      'history',coalesce(p.history,false),'users',coalesce(p.users,false),'contacts',coalesce(p.contacts,false),
      'bonuses',coalesce(p.bonuses,false),'accounts',coalesce(p.accounts,false),
      'shifts',coalesce(p.shifts,false),'chat',coalesce(p.chat,false),
      'external_chat',coalesce(p.external_chat,false),'access_requests',coalesce(p.access_requests,false),
      'platform',coalesce(p.platform,false),'referrals',coalesce(p.referrals,false),
      'wheel',coalesce(p.wheel,false),'portal',coalesce(p.portal,false),
      'announcements',coalesce(p.announcements,false),'themes',coalesce(p.themes,false),
      'telegram',coalesce(p.telegram,false)) end
  from (select 1) seed
  left join public.cashier_profiles c on c.user_id = auth.uid()
  left join public.admin_permissions p on p.user_id = c.user_id;
$$;

-- Se agregan las columnas al final para conservar el orden de la vista existente.
create or replace view public.cashier_directory with (security_invoker = true) as
select c.user_id,c.username,c.display_name,c.avatar_path,c.active,c.created_at,
  p.home,p.deposit,p.withdrawal,p.history,p.users,p.contacts,p.bonuses,p.accounts,p.shifts,p.chat,
  p.external_chat,p.access_requests,p.platform,p.referrals,p.wheel,p.portal,
  p.announcements,p.themes,p.telegram
from public.cashier_profiles c join public.admin_permissions p on p.user_id = c.user_id;

-- Chat externo ya no se concede por el permiso del chat de jugadores.
drop policy if exists external_chat_threads_admin_read on public.external_chat_threads;
create policy external_chat_threads_admin_read on public.external_chat_threads
  for select to authenticated using (public.has_admin_permission('external_chat'));
drop policy if exists external_chat_threads_admin_update on public.external_chat_threads;
create policy external_chat_threads_admin_update on public.external_chat_threads
  for update to authenticated using (public.has_admin_permission('external_chat'))
  with check (public.has_admin_permission('external_chat') and (completed_by is null or completed_by = auth.uid()));
drop policy if exists external_chat_messages_admin_read on public.external_chat_messages;
create policy external_chat_messages_admin_read on public.external_chat_messages
  for select to authenticated using (public.has_admin_permission('external_chat'));
drop policy if exists external_chat_messages_admin_reply on public.external_chat_messages;
create policy external_chat_messages_admin_reply on public.external_chat_messages
  for insert to authenticated with check (
    public.has_admin_permission('external_chat') and sender_type = 'staff' and sender_id = auth.uid()
  );
drop policy if exists external_chat_files_admin_read on storage.objects;
create policy external_chat_files_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'external-chat-files' and public.has_admin_permission('external_chat'));

create or replace view public.external_chat_inbox with (security_invoker = true) as
select thread.id as thread_id, thread.nickname, thread.origin, thread.created_at,
  thread.last_seen_at, thread.completed_at, thread.completed_by,
  latest.id as last_message_id, latest.sender_type as last_sender_type,
  latest.body as last_body, latest.created_at as last_message_at
from public.external_chat_threads thread
join lateral (
  select message.id, message.sender_type, message.body, message.created_at
  from public.external_chat_messages message
  where message.thread_id = thread.id
  order by message.created_at desc, message.id desc
  limit 1
) latest on true
where public.has_admin_permission('external_chat');

-- Platform necesita listar jugadores y los principales asignados sin recibir
-- el permiso general de Jugadores.
drop policy if exists user_profile_read on public.user_profiles;
create policy user_profile_read on public.user_profiles for select to authenticated using (
  user_id=auth.uid() or public.has_admin_permission('home') or public.has_admin_permission('deposit')
  or public.has_admin_permission('withdrawal') or public.has_admin_permission('history')
  or public.has_admin_permission('users')
  or (account_origin = 'platform' and public.has_admin_permission('platform'))
  or public.has_admin_permission('chat')
);
drop policy if exists whatsapp_principals_read on public.whatsapp_principals;
create policy whatsapp_principals_read on public.whatsapp_principals for select to authenticated using (
  public.has_admin_permission('contacts') or public.has_admin_permission('users')
  or public.has_admin_permission('platform')
  or slot = (select p.whatsapp_principal_slot from public.user_profiles p where p.user_id = auth.uid())
);

-- El permiso Portal controla sus cambios en app_settings aunque Contactos
-- también tenga permiso de actualizar esa tabla para sus propios campos.
drop policy if exists settings_edit on public.app_settings;
create policy settings_edit on public.app_settings for update to authenticated
  using (public.has_admin_permission('contacts') or public.has_admin_permission('portal') or public.has_admin_permission('themes'))
  with check (public.has_admin_permission('contacts') or public.has_admin_permission('portal') or public.has_admin_permission('themes'));

create function public.guard_app_settings_page_permissions() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare changed_key text;
begin
  if public.is_super_admin() then return new; end if;
  for changed_key in
    select n.key from jsonb_each(to_jsonb(new)) as n(key,value)
    where n.value is distinct from to_jsonb(old)->n.key
  loop
    if changed_key in ('show_whatsapp','show_telegram','show_instagram','telegram_url','instagram_url','whatsapp_url','help_url') then
      if not public.has_admin_permission('contacts') then
        raise exception using errcode='42501', message='No tenés permiso para editar Contactos.';
      end if;
    elsif changed_key in (
      'home_banner_enabled','home_banner_title','home_banner_url','home_banner_path',
      'home_banner_dark_path','home_banner_christmas_path','home_banner_new_year_path',
      'home_banner_halloween_path','home_banner_layouts','allow_player_logout',
      'portal_header_logo_path','portal_header_logo_halloween_path','portal_header_logo_layouts'
    ) then
      if not public.has_admin_permission('portal') then
        raise exception using errcode='42501', message='No tenés permiso para editar Portal.';
      end if;
    elsif changed_key = 'wheel_enabled' then
      if not public.has_admin_permission('wheel') then
        raise exception using errcode='42501', message='No tenés permiso para activar la ruleta.';
      end if;
    elsif changed_key in (
      'portal_theme','portal_theme_designs','home_bonus_media_path',
      'home_bonus_halloween_media_path','home_bonus_layouts','portal_banners'
    ) then
      if not public.has_admin_permission('themes') then
        raise exception using errcode='42501', message='No tenés permiso para editar Temas.';
      end if;
    else
      raise exception using errcode='42501', message='Esta configuración está reservada al superadministrador.';
    end if;
  end loop;
  return new;
end;
$$;
create trigger guard_app_settings_page_permissions before update on public.app_settings
  for each row execute function public.guard_app_settings_page_permissions();
revoke all on function public.guard_app_settings_page_permissions() from public,anon,authenticated;

drop policy if exists home_banner_insert on storage.objects;
create policy home_banner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-assets' and name ~ '^home-banners/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and public.has_admin_permission('portal')
  );
drop policy if exists portal_header_logo_insert on storage.objects;
create policy portal_header_logo_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-assets' and name ~ '^header-logos/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and public.has_admin_permission('portal')
  );

-- Mensajes programados, temas y Telegram también se asignan por separado.
drop policy if exists scheduled_announcements_admin on public.scheduled_announcements;
create policy scheduled_announcements_admin on public.scheduled_announcements
  for all to authenticated
  using (public.has_admin_permission('announcements'))
  with check (public.has_admin_permission('announcements'));

drop policy if exists telegram_routes_admin on public.telegram_routes;
create policy telegram_routes_admin on public.telegram_routes for all to authenticated
  using (public.has_admin_permission('telegram'))
  with check (public.has_admin_permission('telegram'));
drop policy if exists telegram_alerts_admin_read on public.telegram_alerts;
create policy telegram_alerts_admin_read on public.telegram_alerts for select to authenticated
  using (public.has_admin_permission('telegram'));

do $$
declare function_name text; definition text;
begin
  foreach function_name in array array[
    'public.guard_portal_theme()',
    'public.guard_portal_theme_designs()',
    'public.guard_home_bonus_media()',
    'public.guard_home_bonus_layouts()',
    'public.guard_portal_banners()'
  ] loop
    definition := pg_get_functiondef(to_regprocedure(function_name));
    if definition is null or strpos(definition, 'not public.is_super_admin()') = 0 then
      raise exception 'No se pudo actualizar el permiso de %', function_name;
    end if;
    execute replace(definition, 'not public.is_super_admin()', 'not public.has_admin_permission(''themes'')');
  end loop;
  definition := pg_get_functiondef(to_regprocedure('public.retry_telegram_alert(uuid)'));
  if definition is null or strpos(definition, 'not public.is_super_admin()') = 0 then
    raise exception 'No se pudo actualizar el permiso de retry_telegram_alert';
  end if;
  execute replace(definition, 'not public.is_super_admin()', 'not public.has_admin_permission(''telegram'')');
end;
$$;

drop policy if exists home_bonus_media_insert on storage.objects;
create policy home_bonus_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-assets' and name ~ '^home-bonus/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$'
    and public.has_admin_permission('themes')
  );
drop policy if exists portal_banners_insert on storage.objects;
create policy portal_banners_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-assets' and name ~ '^portal-banners/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$'
    and public.has_admin_permission('themes')
  );
drop policy if exists portal_theme_background_insert on storage.objects;
create policy portal_theme_background_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-assets' and name ~ '^theme-backgrounds/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and public.has_admin_permission('themes')
  );
create policy theme_card_image_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-assets' and name ~ '^theme-card-images/(base|dark|christmas|new-year|halloween|custom-[0-9a-f-]{36})/[a-z0-9-]+-[0-9a-f-]{36}\.(jpg|png|webp)$'
    and public.has_admin_permission('themes')
  );

-- Las recompensas de recomendados se operan con su permiso propio. Jugadores
-- mantiene la lectura del vínculo para confirmar nuevas cuentas referidas.
drop policy if exists referrals_read on public.player_referrals;
create policy referrals_read on public.player_referrals for select to authenticated using (
  referred_user_id=auth.uid() or referrer_user_id=auth.uid()
  or public.has_admin_permission('users') or public.has_admin_permission('referrals')
);
drop policy if exists referral_events_read on public.referral_reward_events;
create policy referral_events_read on public.referral_reward_events for select to authenticated
  using (public.has_admin_permission('referrals'));
drop policy if exists referral_rewards_read on public.referral_rewards;
create policy referral_rewards_read on public.referral_rewards for select to authenticated using (
  beneficiary_user_id=auth.uid() or public.has_admin_permission('referrals')
);

-- Conserva la lógica transaccional existente y cambia únicamente el guard de
-- las funciones de bonos de recomendación. Falla si su cuerpo no es el esperado.
do $$
declare function_name text; definition text;
  old_guard text := 'public.has_admin_permission(''users'') or public.has_admin_permission(''bonuses'')';
begin
  foreach function_name in array array[
    'public.reserve_referral_reward(uuid)',
    'public.release_referral_reward(uuid)',
    'public.mark_referral_reward_credited(uuid)',
    'public.list_referral_rewards(text,integer)'
  ] loop
    definition := pg_get_functiondef(to_regprocedure(function_name));
    if definition is null or strpos(definition, old_guard) = 0 then
      raise exception 'No se pudo actualizar el permiso de %', function_name;
    end if;
    execute replace(definition, old_guard, 'public.has_admin_permission(''referrals'')');
  end loop;
end;
$$;

create or replace function public.wheel_can_manage() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and auth.role() = 'authenticated'
    and public.has_admin_permission('wheel');
$$;

do $$
declare function_name text; definition text;
begin
  foreach function_name in array array[
    'public.replace_wheel_prizes(jsonb)',
    'public.set_wheel_enabled(boolean)'
  ] loop
    definition := pg_get_functiondef(to_regprocedure(function_name));
    if definition is null or strpos(definition, 'public.has_admin_permission(''bonuses'')') = 0 then
      raise exception 'No se pudo actualizar el permiso de %', function_name;
    end if;
    execute replace(definition, 'public.has_admin_permission(''bonuses'')', 'public.has_admin_permission(''wheel'')');
  end loop;
  definition := pg_get_functiondef(to_regprocedure('public.credit_wheel_spin(uuid)'));
  if definition is null or strpos(definition, 'public.has_admin_permission(''bonuses'') or public.has_admin_permission(''deposit'')') = 0 then
    raise exception 'No se pudo actualizar el permiso de credit_wheel_spin';
  end if;
  execute replace(definition,
    'public.has_admin_permission(''bonuses'') or public.has_admin_permission(''deposit'')',
    'public.has_admin_permission(''wheel'')');
end;
$$;

-- El interruptor global de Chat externo está en la configuración reservada.
create or replace function public.set_external_chat_enabled(p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Solo el superadministrador puede configurar el chat externo.';
  end if;
  update public.app_settings set external_chat_enabled = coalesce(p_enabled, false) where id = true;
  return coalesce((select s.external_chat_enabled from public.app_settings s where s.id = true), false);
end;
$$;

commit;
