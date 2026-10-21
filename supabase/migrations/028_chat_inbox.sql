begin;

-- Una fila por conversación para la bandeja. Los mensajes completos se consultan
-- solamente al abrir una conversación; la vista respeta RLS de ambas tablas.
create index if not exists messages_inbox_latest_idx on public.messages(user_id, created_at desc, id desc);

create view public.chat_inbox with (security_invoker = true) as
select latest.user_id, p.username, p.display_name,
  latest.id as last_message_id, latest.sender_id as last_sender_id,
  latest.body as last_body, latest.created_at as last_created_at
from (
  select distinct on (m.user_id) m.user_id, m.id, m.sender_id, m.body, m.created_at
  from public.messages m
  order by m.user_id, m.created_at desc, m.id desc
) latest
left join public.user_profiles p on p.user_id = latest.user_id
where public.has_admin_permission('chat');

revoke all on public.chat_inbox from public, anon, authenticated;
grant select on public.chat_inbox to authenticated;

commit;
