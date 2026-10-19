-- Ejecutar después de 006. Expone al panel el nombre visible de cada usuario.
begin;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

insert into public.user_profiles(user_id, display_name)
select id, left(coalesce(nullif(btrim(raw_user_meta_data->>'display_name'), ''), nullif(split_part(email, '@', 1), ''), 'Usuario'), 80)
from auth.users
on conflict (user_id) do nothing;

create or replace function public.create_user_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_profiles(user_id, display_name)
  values(new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'), ''), nullif(split_part(new.email, '@', 1), ''), 'Usuario'), 80))
  on conflict (user_id) do nothing;
  return new;
end $$;
revoke all on function public.create_user_profile() from public, anon, authenticated;
drop trigger if exists create_user_profile on auth.users;
create trigger create_user_profile after insert on auth.users for each row execute function public.create_user_profile();

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from public, anon, authenticated;
grant select on public.user_profiles to authenticated;
drop policy if exists user_profile_read on public.user_profiles;
create policy user_profile_read on public.user_profiles for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

-- La vista de 006 ya tiene kind en la tercera columna. CREATE OR REPLACE no puede renombrarla.
drop view if exists public.request_summaries;
create view public.request_summaries with (security_invoker = true) as
select r.id,r.user_id,p.display_name as user_name,r.kind,r.amount,r.status,r.created_at,r.holder,r.cbu,r.alias,r.receipt_path,
  to_jsonb(r)->>'receipt_url' as receipt_url,
  (to_jsonb(r)->>'bonus_id')::uuid as bonus_id,
  coalesce((to_jsonb(r)->>'bonus_percent')::numeric,0) as bonus_percent,
  r.approved_at
from public.requests r
join public.user_profiles p on p.user_id = r.user_id;
revoke all on public.request_summaries from public, anon, authenticated;
grant select on public.request_summaries to authenticated;

commit;
