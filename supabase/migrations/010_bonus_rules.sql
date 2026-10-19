-- Ejecutar después de 009. Cada bono elegible es un porcentaje o un monto fijo,
-- y solo aplica cuando la carga está entre min_amount y max_amount, inclusive.
-- Aplicar este SQL antes de desplegar la función submit-deposit.
begin;

alter table public.promotions
  add column if not exists bonus_mode text not null default 'percent',
  add column if not exists bonus_amount numeric(14,2) not null default 0,
  add column if not exists min_amount numeric(14,2) not null default 0,
  add column if not exists max_amount numeric(14,2) not null default 0;

alter table public.promotions drop constraint if exists promotions_bonus_mode;
alter table public.promotions drop constraint if exists promotions_bonus_amount;
alter table public.promotions drop constraint if exists promotions_min_amount;
alter table public.promotions drop constraint if exists promotions_max_amount;
alter table public.promotions drop constraint if exists promotions_bonus_rule;
alter table public.promotions
  add constraint promotions_bonus_mode check (bonus_mode in ('percent', 'fixed')),
  add constraint promotions_bonus_amount check (bonus_amount >= 0 and bonus_amount <= 999999999),
  add constraint promotions_min_amount check (min_amount >= 0 and min_amount <= 999999999),
  add constraint promotions_max_amount check (max_amount >= 0 and max_amount <= 999999999);

-- Los porcentajes ya creados siguen habilitados en todo el rango de cargas.
update public.promotions
set bonus_mode = 'percent', bonus_amount = 0, min_amount = 0.01, max_amount = 999999999
where selectable and bonus_percent > 0;

update public.promotions
set selectable = false
where selectable and bonus_percent <= 0 and bonus_amount <= 0;

update public.promotions
set bonus_mode = 'percent', bonus_amount = 0, min_amount = 0, max_amount = 0
where not selectable;

alter table public.promotions
  add constraint promotions_bonus_rule check (
    (
      not selectable
      and bonus_amount = 0
      and min_amount = 0
      and max_amount = 0
    )
    or (
      selectable
      and min_amount > 0
      and max_amount >= min_amount
      and (
        (bonus_mode = 'percent' and bonus_percent > 0 and bonus_amount = 0)
        or (bonus_mode = 'fixed' and bonus_amount > 0 and bonus_percent = 0)
      )
    )
  );

alter table public.requests
  add column if not exists bonus_amount numeric(14,2) not null default 0
  check (bonus_amount >= 0 and bonus_amount <= 999999999);

alter table public.requests drop constraint if exists requests_bonus_kind;
alter table public.requests
  add constraint requests_bonus_kind check (bonus_percent = 0 or bonus_amount = 0);

alter table public.requests drop constraint request_receipt_kind;
alter table public.requests add constraint request_receipt_kind check (
  (kind = 'deposit' and (receipt_path is not null or (receipt_url is not null and cloudinary_asset_id is not null))) or
  (kind = 'withdrawal' and holder is not null and cbu is not null and cbu ~ '^[0-9]{22}$'
    and receipt_path is null and receipt_url is null and cloudinary_asset_id is null
    and bonus_id is null and bonus_percent = 0 and bonus_amount = 0)
);

create or replace function public.validate_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare offer public.promotions%rowtype;
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
      select * into offer from public.promotions
      where id = new.bonus_id and active and selectable
        and new.amount >= min_amount and new.amount <= max_amount
        and (
          (bonus_mode = 'percent' and bonus_percent > 0 and bonus_amount = 0)
          or (bonus_mode = 'fixed' and bonus_amount > 0 and bonus_percent = 0)
        );
      if not found then raise exception 'El bono no está habilitado para ese monto.'; end if;
      if offer.bonus_mode = 'fixed' then
        new.bonus_percent := 0;
        new.bonus_amount := offer.bonus_amount;
      else
        new.bonus_percent := offer.bonus_percent;
        new.bonus_amount := 0;
      end if;
    else
      new.bonus_percent := 0;
      new.bonus_amount := 0;
    end if;
  end if;
  return new;
end; $$;

-- 007 puede no haber quedado aplicado: su vista intentaba poner user_name
-- donde la vista actual tiene kind, y Postgres rechaza ese renombre.
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

-- CREATE OR REPLACE no puede reordenar ni renombrar columnas de una vista.
drop view if exists public.request_summaries;
create view public.request_summaries with (security_invoker = true) as
select r.id, r.user_id, coalesce(p.display_name, 'Usuario') as user_name, r.kind, r.amount, r.status, r.created_at,
  r.holder, r.cbu, r.alias, r.receipt_path,
  to_jsonb(r)->>'receipt_url' as receipt_url,
  (to_jsonb(r)->>'bonus_id')::uuid as bonus_id,
  coalesce((to_jsonb(r)->>'bonus_percent')::numeric, 0) as bonus_percent,
  coalesce(r.bonus_amount, 0) as bonus_amount,
  r.approved_at
from public.requests r
left join public.user_profiles p on p.user_id = r.user_id;
revoke all on public.request_summaries from public, anon, authenticated;
grant select on public.request_summaries to authenticated;

drop view if exists public.deposit_bonus_totals;
create view public.deposit_bonus_totals with (security_invoker = true) as
select
  r.bonus_percent,
  r.bonus_amount,
  coalesce(
    max(p.title),
    case
      when r.bonus_percent > 0 then '+' || trim(to_char(r.bonus_percent, 'FM990.99')) || '%'
      when r.bonus_amount > 0 then 'Monto fijo'
      else 'Sin bono'
    end
  ) as title,
  count(*)::integer as loads,
  coalesce(sum(
    case
      when r.bonus_percent > 0 then round(r.amount * r.bonus_percent / 100, 2)
      else r.bonus_amount
    end
  ), 0) as bonus_total
from public.requests r
left join public.promotions p on p.id = r.bonus_id
where r.kind = 'deposit'
  and r.status in ('pending', 'approved')
group by r.bonus_id, r.bonus_percent, r.bonus_amount;
revoke all on public.deposit_bonus_totals from public, anon, authenticated;
grant select on public.deposit_bonus_totals to authenticated;

commit;
