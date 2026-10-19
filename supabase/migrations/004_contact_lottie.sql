-- Solo prepara contactos animados. No activa Cloudinary.
-- Requiere 001 y el bucket de 003; no depende de 002.
begin;

-- JSON is for Lottie files; image types remain available.
update storage.buckets set allowed_mime_types = (
  select array_agg(distinct mime) from unnest(
    coalesce(allowed_mime_types, array['image/jpeg','image/png','image/webp','image/svg+xml'])
    || array['application/json']
  ) as mime
) where id = 'app-assets';

create table if not exists public.contact_animations (
  channel text primary key check (channel in ('whatsapp','telegram','instagram')),
  animation_path text check (animation_path ~ '^contacts/[a-zA-Z0-9/_-]+\.json$')
);
insert into public.contact_animations(channel) values ('whatsapp'),('telegram'),('instagram')
on conflict (channel) do nothing;
alter table public.contact_animations enable row level security;
revoke all on public.contact_animations from anon, authenticated;
grant select on public.contact_animations to anon, authenticated;
grant update(animation_path) on public.contact_animations to authenticated;

drop policy if exists contacts_animation_read on public.contact_animations;
create policy contacts_animation_read on public.contact_animations
for select to anon, authenticated using (true);
drop policy if exists contacts_animation_admin on public.contact_animations;
create policy contacts_animation_admin on public.contact_animations
for update to authenticated using (public.is_admin()) with check (public.is_admin());

do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contact_animations') then
    alter publication supabase_realtime add table public.contact_animations;
  end if;
end $$;
commit;

-- El panel futuro subirá el JSON y actualizará la ruta, por ejemplo:
-- update public.contact_animations set animation_path = 'contacts/whatsapp.json'
-- where channel = 'whatsapp';
-- Poner animation_path = null restaura el icono estático.
