-- Un mismo hilo de soporte puede recibir mensajes desde la app y la burbuja externa.
begin;

alter table public.external_chat_threads
  add column linked_user_id uuid references auth.users(id) on delete set null,
  add column linked_at timestamptz,
  add column linked_by uuid references auth.users(id) on delete set null,
  add constraint external_chat_link_consistent check (
    linked_user_id is null or linked_at is not null
  );
create index external_chat_threads_linked_user on public.external_chat_threads(linked_user_id)
  where linked_user_id is not null;

-- Los avisos de credenciales que se generan desde Platform nunca se envían a
-- una burbuja anónima, aunque el chat externo ya esté vinculado.
alter table public.messages add column external_visible boolean not null default true;
create function public.guard_chat_external_visibility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.platform_password_notice', true) = 'on' then
    new.external_visible := false;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_chat_external_visibility() from public, anon, authenticated;
create trigger guard_chat_external_visibility before insert on public.messages
  for each row execute function public.guard_chat_external_visibility();

create function public.link_external_chat(p_thread_id uuid, p_username text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target_user uuid; thread_id uuid;
begin
  if auth.uid() is null or not (
    public.has_admin_permission('chat') and public.has_admin_permission('external_chat')
  ) then
    raise exception using errcode='42501', message='Necesitás acceso a Chat y Chat externo para vincular conversaciones.';
  end if;
  if p_username is null or btrim(p_username) !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$' then
    raise exception using errcode='22023', message='Ingresá un nombre de usuario válido.';
  end if;
  select p.user_id into target_user
    from public.user_profiles p
    where lower(p.username) = lower(btrim(p_username))
      and not exists (select 1 from public.admin_users a where a.user_id = p.user_id);
  if target_user is null then
    raise exception using errcode='P0002', message='No encontramos ese jugador.';
  end if;
  select t.id into thread_id from public.external_chat_threads t
    where t.id = p_thread_id and t.linked_user_id is null for update;
  if thread_id is null then
    raise exception using errcode='P0002', message='Esta conversación ya fue vinculada o no existe.';
  end if;
  update public.external_chat_threads
    set linked_user_id=target_user, linked_at=clock_timestamp(), linked_by=auth.uid(),
        completed_at=null, completed_by=null
    where id=thread_id;
  delete from public.chat_thread_completions where user_id=target_user;
  return target_user;
end;
$$;
revoke all on function public.link_external_chat(uuid,text) from public, anon, authenticated;
grant execute on function public.link_external_chat(uuid,text) to authenticated;

create function public.unlink_external_chat(p_thread_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare former_user uuid;
begin
  if auth.uid() is null or not (
    public.has_admin_permission('chat') and public.has_admin_permission('external_chat')
  ) then
    raise exception using errcode='42501', message='Necesitás acceso a Chat y Chat externo para desvincular conversaciones.';
  end if;
  select linked_user_id into former_user from public.external_chat_threads
    where id=p_thread_id and linked_user_id is not null for update;
  if former_user is null then
    raise exception using errcode='P0002', message='Esta conversación ya no está vinculada.';
  end if;
  update public.external_chat_threads
    set linked_user_id=null, linked_at=null, linked_by=null
    where id=p_thread_id;
end;
$$;
revoke all on function public.unlink_external_chat(uuid) from public, anon, authenticated;
grant execute on function public.unlink_external_chat(uuid) to authenticated;

-- El jugador y los cajeros con Chat leen la parte externa solo después del
-- vínculo. El permiso Chat externo conserva acceso a todos los chats externos.
create policy external_chat_threads_linked_read on public.external_chat_threads
  for select to authenticated using (
    linked_user_id is not null and
    (linked_user_id=auth.uid() or public.has_admin_permission('chat'))
  );
create policy external_chat_messages_linked_read on public.external_chat_messages
  for select to authenticated using (
    exists (
      select 1 from public.external_chat_threads t
      where t.id=thread_id and t.linked_user_id is not null
        and (t.linked_user_id=auth.uid() or public.has_admin_permission('chat'))
    )
  );
create policy external_chat_files_linked_read on storage.objects
  for select to authenticated using (
    bucket_id='external-chat-files' and exists (
      select 1 from public.external_chat_messages m
      join public.external_chat_threads t on t.id=m.thread_id
      where m.attachment_path=name and t.linked_user_id is not null
        and (t.linked_user_id=auth.uid() or public.has_admin_permission('chat'))
    )
  );

-- La app y el panel consultan la misma línea de tiempo sin copiar ni alterar
-- quién escribió cada mensaje.
create view public.unified_chat_messages with (security_invoker = true) as
select m.id,m.user_id,m.sender_id,m.body,m.attachment_path,m.created_at,
  'app'::text as source,null::uuid as external_thread_id
from public.messages m
union all
select m.id,t.linked_user_id as user_id,
  coalesce(m.sender_id,t.linked_user_id) as sender_id,
  m.body,m.attachment_path,m.created_at,
  'external'::text as source,t.id as external_thread_id
from public.external_chat_messages m
join public.external_chat_threads t on t.id=m.thread_id
where t.linked_user_id is not null;
revoke all on public.unified_chat_messages from public, anon, authenticated;
grant select on public.unified_chat_messages to authenticated;

create or replace view public.chat_inbox with (security_invoker = true) as
select latest.user_id,p.username,p.display_name,
  latest.id as last_message_id,latest.sender_id as last_sender_id,
  latest.body as last_body,latest.created_at as last_created_at,
  completion.completed_at,completion.completed_by,latest.source as last_source
from (
  select distinct on (feed.user_id) feed.user_id,feed.id,feed.sender_id,feed.body,feed.created_at,feed.source
  from (
    select m.user_id,m.id,m.sender_id,m.body,m.created_at,'app'::text as source from public.messages m
    union all
    select t.linked_user_id as user_id,m.id,
      coalesce(m.sender_id,t.linked_user_id) as sender_id,m.body,m.created_at,'external'::text as source
    from public.external_chat_messages m
    join public.external_chat_threads t on t.id=m.thread_id
    where t.linked_user_id is not null
  ) feed
  order by feed.user_id,feed.created_at desc,feed.id desc
) latest
left join public.user_profiles p on p.user_id=latest.user_id
left join public.chat_thread_completions completion on completion.user_id=latest.user_id
where public.has_admin_permission('chat');

-- Las conversaciones vinculadas salen de la bandeja externa y quedan en Chat.
create or replace view public.external_chat_inbox with (security_invoker = true) as
select thread.id as thread_id,thread.nickname,thread.origin,thread.created_at,
  thread.last_seen_at,thread.completed_at,thread.completed_by,
  latest.id as last_message_id,latest.sender_type as last_sender_type,
  latest.body as last_body,latest.created_at as last_message_at
from public.external_chat_threads thread
join lateral (
  select message.id,message.sender_type,message.body,message.created_at
  from public.external_chat_messages message
  where message.thread_id=thread.id
  order by message.created_at desc,message.id desc limit 1
) latest on true
where thread.linked_user_id is null and public.has_admin_permission('external_chat');

create or replace function public.set_chat_thread_completed(
  p_user_id uuid,p_last_message_id uuid,p_completed boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare current_message_id uuid;
begin
  if auth.uid() is null or not public.has_admin_permission('chat') then
    raise exception using errcode='42501',message='Operación no permitida.';
  end if;
  if p_user_id is null or p_last_message_id is null or p_completed is null then
    raise exception using errcode='22023',message='Conversación inválida.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  select latest.id into current_message_id from (
    select m.id,m.created_at from public.messages m where m.user_id=p_user_id
    union all
    select m.id,m.created_at from public.external_chat_messages m
      join public.external_chat_threads t on t.id=m.thread_id
      where t.linked_user_id=p_user_id
  ) latest order by latest.created_at desc,latest.id desc limit 1;
  if current_message_id is distinct from p_last_message_id then
    raise exception using errcode='P0001',message='La conversación recibió mensajes nuevos. Actualizá e intentá de nuevo.';
  end if;
  if p_completed then
    insert into public.chat_thread_completions(user_id,completed_by)
      values(p_user_id,auth.uid())
      on conflict(user_id) do update set completed_at=now(),completed_by=excluded.completed_by;
  else
    delete from public.chat_thread_completions where user_id=p_user_id;
  end if;
end;
$$;

create function public.reopen_linked_chat_on_external_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_user uuid;
begin
  if new.sender_type <> 'visitor' then return new; end if;
  select linked_user_id into target_user from public.external_chat_threads where id=new.thread_id;
  if target_user is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user::text,0));
    delete from public.chat_thread_completions where user_id=target_user;
  end if;
  return new;
end;
$$;
revoke all on function public.reopen_linked_chat_on_external_message() from public, anon, authenticated;
create trigger reopen_linked_chat_on_external_message
  after insert on public.external_chat_messages for each row
  execute function public.reopen_linked_chat_on_external_message();

-- Después del vínculo, las respuestas del panel salen por Chat normal para
-- conservar sus avisos y hacerlas visibles en ambos canales.
create function public.guard_linked_external_staff_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sender_type='staff' and exists (
    select 1 from public.external_chat_threads t
    where t.id=new.thread_id and t.linked_user_id is not null
  ) then
    raise exception using errcode='22023',message='Esta conversación está vinculada. Respondé desde Chat.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_linked_external_staff_reply() from public, anon, authenticated;
create trigger guard_linked_external_staff_reply
  before insert on public.external_chat_messages for each row
  execute function public.guard_linked_external_staff_reply();

commit;
