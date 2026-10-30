begin;
alter table public.promotions add column deposit_image_path text;
alter table public.promotions add constraint promotions_deposit_image_path_valid check (
  deposit_image_path is null or deposit_image_path ~ '^deposit-bonus-images/[0-9a-f-]{36}\.(jpg|png|webp)$'
);
create policy deposit_bonus_image_insert on storage.objects for insert to authenticated
  with check (bucket_id='app-assets' and name ~ '^deposit-bonus-images/[0-9a-f-]{36}\.(jpg|png|webp)$' and public.has_admin_permission('bonuses'));
commit;
