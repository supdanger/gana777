-- Ejecutar después de 001_initial.sql. Conserva los comprobantes anteriores.
begin;
create table public.app_settings (
  id boolean primary key default true check (id),
  logo_path text,
  login_image_path text not null default 'brand/login-reference.png',
  login_image_layout text not null default 'reference' check (login_image_layout in ('reference','image')),
  whatsapp_url text check (whatsapp_url ~ '^https://(wa.me|api.whatsapp.com)/'),
  telegram_url text check (telegram_url ~ '^https://t.me/'),
  instagram_url text check (instagram_url ~ '^https://(www\.)?instagram.com/'),
  help_url text check (help_url ~ '^https://')
);
insert into public.app_settings(id) values (true);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant update on public.app_settings to authenticated;
create policy settings_read on public.app_settings for select to anon, authenticated using (true);
create policy settings_edit on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 100),
  description text not null default '',
  image_path text,
  image_layout text not null default 'image' check (image_layout in ('reference','image')),
  bonus_percent numeric(5,2) not null default 0 check (bonus_percent between 0 and 100),
  active boolean not null default false,
  show_banner boolean not null default false,
  selectable boolean not null default false,
  sort_order integer not null default 0
);
insert into public.promotions(id,title,description,image_path,image_layout,active,show_banner)
values ('00000000-0000-4000-8000-000000000777','Bono de bienvenida',
  'Hacé tu primer depósito y recibí un premio extra para empezar.',
  'banners/welcome-reference.png','reference',true,true);
alter table public.promotions enable row level security;
revoke all on public.promotions from anon, authenticated;
grant select on public.promotions to anon, authenticated;
grant insert, update, delete on public.promotions to authenticated;
create policy promotions_public_read on public.promotions for select to anon, authenticated using (active);
create policy promotions_admin_read on public.promotions for select to authenticated using (public.is_admin());
create policy promotions_admin_write on public.promotions for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('app-assets','app-assets',true,5242880,array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do nothing;
-- Storage may already have been prepared independently with 003.
drop policy if exists assets_read on storage.objects;
drop policy if exists assets_insert on storage.objects;
drop policy if exists assets_update on storage.objects;
drop policy if exists assets_delete on storage.objects;
create policy assets_read on storage.objects for select to anon, authenticated using (bucket_id = 'app-assets');
create policy assets_insert on storage.objects for insert to authenticated with check (bucket_id = 'app-assets' and public.is_admin());
create policy assets_update on storage.objects for update to authenticated using (bucket_id = 'app-assets' and public.is_admin()) with check (bucket_id = 'app-assets' and public.is_admin());
create policy assets_delete on storage.objects for delete to authenticated using (bucket_id = 'app-assets' and public.is_admin());

alter table public.requests add column receipt_url text,
  add column cloudinary_asset_id text,
  add column bonus_id uuid references public.promotions(id) on delete restrict,
  add column bonus_percent numeric(5,2) not null default 0 check (bonus_percent between 0 and 100);
-- Locate the original unnamed cross-column check without relying on its generated name.
do $$ declare constraint_name text; begin
  for constraint_name in select conname from pg_constraint
    where conrelid = 'public.requests'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%receipt_path%'
  loop execute format('alter table public.requests drop constraint %I', constraint_name); end loop;
end $$;
alter table public.requests add constraint request_receipt_kind check (
  (kind = 'deposit' and (receipt_path is not null or (receipt_url is not null and cloudinary_asset_id is not null))) or
  (kind = 'withdrawal' and holder is not null and cbu is not null and cbu ~ '^[0-9]{22}$'
    and receipt_path is null and receipt_url is null and cloudinary_asset_id is null and bonus_id is null and bonus_percent = 0)
);
alter table public.requests add constraint receipt_cloudinary_url check (
  receipt_url is null or receipt_url ~ '^https://res\.cloudinary\.com/[a-zA-Z0-9_-]+/image/authenticated/'
);
-- New deposits are created by the Edge Function after a verified Cloudinary upload.
drop policy request_create on public.requests;
create policy request_create on public.requests for insert to authenticated
with check (user_id = (select auth.uid()) and kind = 'withdrawal' and status = 'pending');
revoke insert(receipt_path) on public.requests from authenticated;
grant all on public.requests to service_role;

create or replace function public.validate_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if new.kind = 'withdrawal' and exists (
    select 1 from public.requests where user_id = new.user_id and kind = 'withdrawal'
      and created_at > now() - interval '24 hours'
  ) then raise exception 'Solo podés solicitar un retiro cada 24 horas.'; end if;
  if new.kind = 'deposit' then
    if not exists(select 1 from public.bank_accounts where active) then
      raise exception 'No hay una cuenta habilitada para recibir cargas.';
    end if;
    if new.receipt_url is null or new.cloudinary_asset_id is null then
      raise exception 'El comprobante debe subirse mediante Cloudinary.';
    end if;
    if new.bonus_id is not null then
      select bonus_percent into new.bonus_percent from public.promotions
      where id = new.bonus_id and active and selectable and bonus_percent > 0;
      if not found then raise exception 'El bono seleccionado ya no está disponible.'; end if;
    else new.bonus_percent := 0;
    end if;
  end if;
  return new;
end; $$;

-- Persistent upload throttling; only the server records attempts.
create table public.receipt_upload_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index receipt_attempts_user_time on public.receipt_upload_attempts(user_id, created_at);
alter table public.receipt_upload_attempts enable row level security;
revoke all on public.receipt_upload_attempts from anon, authenticated;
create function public.reserve_receipt_upload() returns void
language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Ingresá a tu cuenta.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 1));
  if (select count(*) from public.receipt_upload_attempts where user_id = current_user_id
    and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Alcanzaste el límite de envíos. Esperá unos minutos para volver a intentar.';
  end if;
  delete from public.receipt_upload_attempts where user_id = current_user_id and created_at < now() - interval '1 day';
  insert into public.receipt_upload_attempts(user_id) values (current_user_id);
end; $$;
revoke all on function public.reserve_receipt_upload() from public;
grant execute on function public.reserve_receipt_upload() to authenticated;
-- Existing receipts remain readable, but new files no longer enter Supabase Storage.
drop policy receipt_upload on storage.objects;
alter publication supabase_realtime add table public.app_settings, public.promotions;
commit;
