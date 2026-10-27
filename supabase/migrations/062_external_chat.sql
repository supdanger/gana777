begin;

create table public.external_chat_threads (
  id uuid primary key default gen_random_uuid(),
  nickname text not null unique check (length(nickname) between 6 and 32),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  origin text not null check (origin in ('https://gana777bet.com', 'https://www.gana777bet.com')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  check ((completed_at is null and completed_by is null) or completed_at is not null)
);

create table public.external_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.external_chat_threads(id) on delete cascade,
  sender_type text not null check (sender_type in ('visitor', 'staff')),
  sender_id uuid references auth.users(id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check ((sender_type = 'visitor' and sender_id is null) or (sender_type = 'staff' and sender_id is not null))
);

create index external_chat_messages_thread_date on public.external_chat_messages(thread_id, created_at desc, id desc);
create index external_chat_threads_activity on public.external_chat_threads(last_seen_at desc);

alter table public.external_chat_threads enable row level security;
alter table public.external_chat_messages enable row level security;
revoke all on public.external_chat_threads from public, anon, authenticated;
revoke all on public.external_chat_messages from public, anon, authenticated;

grant select on public.external_chat_threads to authenticated;
grant update(completed_at, completed_by) on public.external_chat_threads to authenticated;
grant select, insert on public.external_chat_messages to authenticated;

create policy external_chat_threads_admin_read on public.external_chat_threads
  for select to authenticated using (public.has_admin_permission('chat'));
create policy external_chat_threads_admin_update on public.external_chat_threads
  for update to authenticated using (public.has_admin_permission('chat'))
  with check (public.has_admin_permission('chat') and (completed_by is null or completed_by = auth.uid()));
create policy external_chat_messages_admin_read on public.external_chat_messages
  for select to authenticated using (public.has_admin_permission('chat'));
create policy external_chat_messages_admin_reply on public.external_chat_messages
  for insert to authenticated with check (
    public.has_admin_permission('chat') and sender_type = 'staff' and sender_id = auth.uid()
  );

create or replace function public.limit_external_chat_visitor_messages()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recent_count integer;
begin
  if new.sender_type <> 'visitor' then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.thread_id::text, 0));
  select count(*) into recent_count from public.external_chat_messages
    where thread_id = new.thread_id and sender_type = 'visitor'
      and created_at > now() - interval '30 seconds';
  if recent_count >= 5 then
    raise exception using errcode = 'P0001', message = 'Esperá un momento antes de enviar otro mensaje.';
  end if;
  return new;
end;
$$;
revoke all on function public.limit_external_chat_visitor_messages() from public, anon, authenticated;
create trigger limit_external_chat_visitor_messages
  before insert on public.external_chat_messages for each row
  execute function public.limit_external_chat_visitor_messages();

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
where public.has_admin_permission('chat');
revoke all on public.external_chat_inbox from public, anon, authenticated;
grant select on public.external_chat_inbox to authenticated;

alter publication supabase_realtime add table public.external_chat_threads, public.external_chat_messages;

commit;
