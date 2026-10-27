begin;

alter table public.external_chat_messages
  add column attachment_path text
  check (attachment_path is null or attachment_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('external-chat-files', 'external-chat-files', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy external_chat_files_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'external-chat-files' and public.has_admin_permission('chat'));

commit;
