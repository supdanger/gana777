begin;

alter table public.messages
  add column attachment_path text
  check (attachment_path is null or attachment_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$');
grant insert(attachment_path) on public.messages to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

create policy chat_images_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'chat-images'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
  and (split_part(name, '/', 1) = auth.uid()::text or public.has_admin_permission('chat'))
);
create policy chat_images_read on storage.objects for select to authenticated using (
  bucket_id = 'chat-images'
  and (split_part(name, '/', 1) = auth.uid()::text or public.has_admin_permission('chat'))
);
create policy chat_images_cleanup on storage.objects for delete to authenticated using (
  bucket_id = 'chat-images'
  and (split_part(name, '/', 1) = auth.uid()::text or public.has_admin_permission('chat'))
  and not exists (select 1 from public.messages m where m.attachment_path = name)
);

create or replace function public.guard_chat_attachment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.attachment_path is not null and (
    split_part(new.attachment_path, '/', 1) <> new.user_id::text
    or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'chat-images' and o.name = new.attachment_path
    )
  ) then
    raise exception using errcode = '22023', message = 'Imagen de chat no válida.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_chat_attachment() from public, anon, authenticated;
create trigger guard_chat_attachment before insert on public.messages
for each row execute function public.guard_chat_attachment();

commit;
