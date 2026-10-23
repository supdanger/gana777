-- Banner multimedia del tema base. El banner «Ir al casino» permanece independiente.
begin;

alter table public.app_settings
  add column home_bonus_media_path text,
  add constraint home_bonus_media_path_valid check (
    home_bonus_media_path is null or home_bonus_media_path ~ '^home-bonus/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$'
  );

create function public.guard_home_bonus_media() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.home_bonus_media_path is distinct from old.home_bonus_media_path
    and not public.is_super_admin() then
    raise exception 'Solo un superadministrador puede cambiar el banner de bonos.';
  end if;
  return new;
end; $$;
create trigger guard_home_bonus_media before update on public.app_settings
  for each row execute function public.guard_home_bonus_media();

update storage.buckets set
  file_size_limit = greatest(coalesce(file_size_limit, 0), 20971520),
  allowed_mime_types = (
    select array_agg(distinct mime) from unnest(
      coalesce(allowed_mime_types, array['image/jpeg','image/png','image/webp','image/svg+xml'])
      || array['video/mp4','video/webm']
    ) as mime
  )
where id = 'app-assets';

create policy home_bonus_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-assets'
    and name ~ '^home-bonus/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$'
    and public.is_super_admin()
  );

commit;
