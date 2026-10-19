-- Solo recursos visuales; no activa Cloudinary.
-- Requiere 001_initial.sql. Puede ejecutarse antes o después de 002.
-- Se puede repetir sin borrar las imágenes existentes.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-assets', 'app-assets', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = (
    select array_agg(distinct mime) from unnest(
      coalesce(storage.buckets.allowed_mime_types, array[]::text[]) || excluded.allowed_mime_types
    ) as mime
  );

drop policy if exists assets_read on storage.objects;
create policy assets_read on storage.objects
for select to anon, authenticated
using (bucket_id = 'app-assets');

drop policy if exists assets_insert on storage.objects;
create policy assets_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'app-assets' and public.is_admin());

drop policy if exists assets_update on storage.objects;
create policy assets_update on storage.objects
for update to authenticated
using (bucket_id = 'app-assets' and public.is_admin())
with check (bucket_id = 'app-assets' and public.is_admin());

drop policy if exists assets_delete on storage.objects;
create policy assets_delete on storage.objects
for delete to authenticated
using (bucket_id = 'app-assets' and public.is_admin());

commit;

-- Subir después las imágenes mediante Storage o: npm.cmd run assets:upload
-- Rutas dentro del bucket app-assets:
-- brand/panda-login-transparent.png
-- avatars/panda-user-avatar.png
-- banners/welcome-reference.png
