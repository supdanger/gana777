begin;

-- Solo se guarda una fila mientras la conversación está completada.
create table public.chat_thread_completions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  completed_by uuid references auth.users(id) on delete set null
);

alter table public.chat_thread_completions enable row level security;
create policy chat_thread_completions_admin_read on public.chat_thread_completions
  for select to authenticated using (public.has_admin_permission('chat'));
revoke all on public.chat_thread_completions from public, anon, authenticated;
grant select on public.chat_thread_completions to authenticated;

create or replace function public.set_chat_thread_completed(
  p_user_id uuid, p_last_message_id uuid, p_completed boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  current_message_id uuid;
begin
  if auth.uid() is null or not public.has_admin_permission('chat') then
    raise exception using errcode = '42501', message = 'Operación no permitida.';
  end if;
  if p_user_id is null or p_last_message_id is null or p_completed is null then
    raise exception using errcode = '22023', message = 'Conversación inválida.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select m.id into current_message_id
  from public.messages m
  where m.user_id = p_user_id
  order by m.created_at desc, m.id desc
  limit 1;
  if current_message_id is distinct from p_last_message_id then
    raise exception using errcode = 'P0001', message = 'La conversación recibió mensajes nuevos. Actualizá e intentá de nuevo.';
  end if;

  if p_completed then
    insert into public.chat_thread_completions (user_id, completed_by)
    values (p_user_id, auth.uid())
    on conflict (user_id) do update
      set completed_at = now(), completed_by = excluded.completed_by;
  else
    delete from public.chat_thread_completions where user_id = p_user_id;
  end if;
end;
$$;
revoke all on function public.set_chat_thread_completed(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_chat_thread_completed(uuid, uuid, boolean) to authenticated;

create or replace function public.reopen_chat_thread_on_player_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.sender_id = new.user_id then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
    delete from public.chat_thread_completions where user_id = new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function public.reopen_chat_thread_on_player_message() from public, anon, authenticated;
create trigger reopen_chat_thread_on_player_message
  after insert on public.messages for each row
  execute function public.reopen_chat_thread_on_player_message();

create or replace view public.chat_inbox with (security_invoker = true) as
select latest.user_id, p.username, p.display_name,
  latest.id as last_message_id, latest.sender_id as last_sender_id,
  latest.body as last_body, latest.created_at as last_created_at,
  completion.completed_at, completion.completed_by
from (
  select distinct on (m.user_id) m.user_id, m.id, m.sender_id, m.body, m.created_at
  from public.messages m
  order by m.user_id, m.created_at desc, m.id desc
) latest
left join public.user_profiles p on p.user_id = latest.user_id
left join public.chat_thread_completions completion on completion.user_id = latest.user_id
where public.has_admin_permission('chat');

commit;
