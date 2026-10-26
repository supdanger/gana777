begin;

alter table public.promotions
  add column cooldown_hours integer not null default 0 check (cooldown_hours between 0 and 720),
  add column banner_layout jsonb not null default '{}'::jsonb;
alter table public.promotions add constraint promotions_special_fixed
  check (cooldown_hours = 0 or (bonus_mode = 'fixed' and bonus_amount > 0 and selectable));

alter table public.requests
  add column requested_special_bonus_id uuid references public.promotions(id) on delete restrict,
  add column special_cooldown_hours integer not null default 0,
  add column special_min_amount numeric(14,2) not null default 0,
  add column special_max_amount numeric(14,2) not null default 0;

create table public.special_bonus_uses (
  request_id uuid primary key references public.requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  promotion_id uuid not null references public.promotions(id) on delete restrict,
  used_at timestamptz not null,
  next_available_at timestamptz not null
);
create index special_bonus_uses_user_promotion_idx on public.special_bonus_uses(user_id, promotion_id, used_at desc);
alter table public.special_bonus_uses enable row level security;
revoke all on public.special_bonus_uses from public, anon, authenticated;
grant select on public.special_bonus_uses to authenticated;
create policy special_bonus_uses_own_read on public.special_bonus_uses for select to authenticated
  using (user_id = (select auth.uid()) or public.has_admin_permission('deposit'));

-- validate_request ya bloquea por usuario y copia el valor del bono antes de este trigger.
create function public.zz_validate_special_bonus_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_offer public.promotions%rowtype;
begin
  if new.kind <> 'deposit' or new.bonus_id is null then return new; end if;
  select * into v_offer from public.promotions where id = new.bonus_id;
  if v_offer.cooldown_hours <= 0 then return new; end if;
  if v_offer.bonus_mode <> 'fixed' then raise exception 'El bono especial debe tener un monto fijo.'; end if;
  if exists (
    select 1 from public.special_bonus_uses u
    where u.user_id = new.user_id and u.promotion_id = new.bonus_id
      and u.next_available_at > now()
  ) then raise exception 'El bono especial todavía está en espera.'; end if;
  if exists (
    select 1 from public.requests r
    left join public.deposit_credits dc on dc.request_id = r.id
    where r.user_id = new.user_id and r.bonus_id = new.bonus_id
      and r.status = 'approved' and dc.request_id is null
  ) then raise exception 'Ya tenés una carga con este bono pendiente de acreditación.'; end if;
  new.requested_special_bonus_id := new.bonus_id;
  new.special_cooldown_hours := v_offer.cooldown_hours;
  new.special_min_amount := v_offer.min_amount;
  new.special_max_amount := v_offer.max_amount;
  return new;
end $$;
revoke all on function public.zz_validate_special_bonus_request() from public, anon, authenticated;
create trigger zz_validate_special_bonus_request before insert on public.requests
  for each row execute function public.zz_validate_special_bonus_request();

-- Solo la función de revisión puede ajustar una carga especial. Una actualización
-- directa desde el cliente sigue limitada a cambiar el estado.
create or replace function public.guard_request_input() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if auth.role() in ('anon','authenticated') and not public.is_admin() then
      raise exception using errcode = '42501', message = 'Operación no permitida.';
    end if;
    if old.status <> 'pending' or new.status not in ('approved','rejected') then
      raise exception using errcode = '22023', message = 'Solo se puede revisar una solicitud pendiente.';
    end if;
    if old.requested_special_bonus_id is not null and new.status = 'approved'
      and current_setting('app.review_special_deposit', true) is distinct from 'on' then
      raise exception using errcode = '22023', message = 'Revisá el monto recibido y decidí si corresponde el bono especial.';
    end if;
    if current_setting('app.review_special_deposit', true) = 'on'
      and new.kind = 'deposit' and old.kind = 'deposit'
      and old.requested_special_bonus_id is not null
      and public.has_admin_permission('deposit') then
      if (to_jsonb(new) - array['status','amount','bonus_id','bonus_percent','bonus_amount'])
        is distinct from (to_jsonb(old) - array['status','amount','bonus_id','bonus_percent','bonus_amount']) then
        raise exception using errcode = '22023', message = 'No se pueden cambiar otros datos de la carga.';
      end if;
    elsif (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception using errcode = '22023', message = 'Solo se puede revisar una solicitud pendiente.';
    end if;
    return new;
  end if;
  if auth.role() in ('anon','authenticated') and (auth.uid() is null or new.user_id <> auth.uid()) then
    raise exception using errcode = '42501', message = 'Operación no permitida.';
  end if;
  if new.status <> 'pending' or new.amount <= 0 or new.amount > 999999999 then
    raise exception using errcode = '22023', message = 'Datos de solicitud no válidos.';
  end if;
  new.created_at := now();
  if new.kind = 'withdrawal' then
    new.holder := btrim(new.holder);
    new.alias := nullif(btrim(new.alias), '');
    if not app_private.valid_holder(new.holder) or new.cbu is null or new.cbu !~ '^[0-9]{22}$'
      or (new.alias is not null and new.alias !~ '^[a-zA-Z0-9.-]{6,20}$') then
      raise exception using errcode = '22023', message = 'Datos bancarios no válidos.';
    end if;
  end if;
  return new;
end $$;

create function public.review_special_deposit(p_request_id uuid, p_actual_amount numeric, p_apply_bonus boolean)
returns public.requests language plpgsql security definer set search_path = '' as $$
declare v_request public.requests%rowtype;
begin
  if not public.has_admin_permission('deposit') then
    raise exception 'No tenés permiso para revisar cargas.' using errcode = '42501';
  end if;
  if p_actual_amount is null or p_actual_amount <= 0 or p_actual_amount > 999999999
    or p_actual_amount <> round(p_actual_amount, 2) or p_apply_bonus is null then
    raise exception 'Ingresá el monto exacto recibido.' using errcode = '22023';
  end if;
  select * into v_request from public.requests where id = p_request_id for update;
  if not found or v_request.kind <> 'deposit' or v_request.status <> 'pending'
    or v_request.requested_special_bonus_id is null then
    raise exception 'La carga especial ya no está pendiente.' using errcode = '22023';
  end if;
  if p_apply_bonus and (p_actual_amount < v_request.special_min_amount
    or p_actual_amount > v_request.special_max_amount) then
    raise exception 'El monto recibido no cumple las condiciones del bono.' using errcode = '22023';
  end if;
  perform set_config('app.review_special_deposit', 'on', true);
  update public.requests set status = 'approved', amount = p_actual_amount,
    bonus_id = case when p_apply_bonus then bonus_id else null end,
    bonus_percent = case when p_apply_bonus then bonus_percent else 0 end,
    bonus_amount = case when p_apply_bonus then bonus_amount else 0 end
    where id = p_request_id returning * into v_request;
  perform set_config('app.review_special_deposit', 'off', true);
  return v_request;
end $$;
revoke all on function public.review_special_deposit(uuid,numeric,boolean) from public, anon, authenticated;
grant execute on function public.review_special_deposit(uuid,numeric,boolean) to authenticated;

create or replace function public.confirm_deposit_credit(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.requests%rowtype;
  v_notification_id uuid;
  v_credited_at timestamptz;
  v_new boolean := false;
begin
  if not public.has_admin_permission('deposit') then
    raise exception 'No tenés permiso para acreditar cargas.' using errcode = '42501';
  end if;
  select * into v_request from public.requests where id = p_request_id for update;
  if not found or v_request.kind <> 'deposit' or v_request.status <> 'approved' then
    raise exception 'La carga debe estar aprobada antes de confirmar la acreditación.' using errcode = '22023';
  end if;
  if v_request.bonus_id is not null and v_request.special_cooldown_hours > 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_request.user_id::text || ':' || v_request.bonus_id::text, 0));
    if not exists (select 1 from public.deposit_credits where request_id = p_request_id)
      and exists (select 1 from public.special_bonus_uses
        where user_id = v_request.user_id and promotion_id = v_request.bonus_id
          and next_available_at > now()) then
      raise exception 'El bono especial sigue en espera. Revisá esta carga sin bono.' using errcode = '22023';
    end if;
  end if;
  insert into public.deposit_credits(request_id, user_id, confirmed_by)
    values (v_request.id, v_request.user_id, auth.uid())
    on conflict (request_id) do nothing returning credited_at into v_credited_at;
  if v_credited_at is not null and v_request.bonus_id is not null and v_request.special_cooldown_hours > 0 then
    insert into public.special_bonus_uses(request_id, user_id, promotion_id, used_at, next_available_at)
      values (v_request.id, v_request.user_id, v_request.bonus_id, v_credited_at,
        v_credited_at + make_interval(hours => v_request.special_cooldown_hours));
  end if;
  insert into public.user_notifications(user_id, request_id, kind, title, body)
    values (v_request.user_id, v_request.id, 'deposit_credited', '¡Tu carga fue acreditada!',
      'Ya acreditamos tu carga de ' || to_char(v_request.amount, 'FM999G999G999G990D00') || '. Entrá a Gana777 para verla.')
    on conflict (request_id) where kind = 'deposit_credited' do nothing returning id into v_notification_id;
  v_new := v_notification_id is not null;
  if not v_new then
    select id into v_notification_id from public.user_notifications
      where request_id = v_request.id and kind = 'deposit_credited';
  end if;
  return jsonb_build_object('notification_id', v_notification_id, 'newly_credited', v_new);
end $$;

create function public.special_bonus_availability()
returns table(promotion_id uuid, next_available_at timestamptz, awaiting_credit boolean, server_now timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, last_use.next_available_at,
    exists (select 1 from public.requests r
      left join public.deposit_credits dc on dc.request_id = r.id
      where r.user_id = auth.uid() and r.bonus_id = p.id
        and r.status in ('pending','approved') and dc.request_id is null),
    now()
  from public.promotions p
  left join lateral (
    select u.next_available_at from public.special_bonus_uses u
    where u.user_id = auth.uid() and u.promotion_id = p.id
    order by u.used_at desc limit 1
  ) last_use on true
  where p.active and p.cooldown_hours > 0;
$$;
revoke all on function public.special_bonus_availability() from public, anon, authenticated;
grant execute on function public.special_bonus_availability() to authenticated;

-- Mantiene las columnas existentes de la vista y añade el bono originalmente pedido.
create or replace view public.request_summaries with (security_invoker = true) as
select r.id, r.user_id, coalesce(p.username, p.display_name, 'Usuario') as user_name, r.kind, r.amount, r.status, r.created_at,
  r.holder, r.cbu, r.alias, r.receipt_path,
  to_jsonb(r)->>'receipt_url' as receipt_url,
  (to_jsonb(r)->>'bonus_id')::uuid as bonus_id,
  coalesce((to_jsonb(r)->>'bonus_percent')::numeric, 0) as bonus_percent,
  coalesce(r.bonus_amount, 0) as bonus_amount,
  r.approved_at, dc.credited_at, route.deposit_holder, route.deposit_phone, route.deposit_sac,
  r.requested_special_bonus_id, r.special_min_amount, r.special_max_amount
from public.requests r
left join public.user_profiles p on p.user_id = r.user_id
left join public.deposit_credits dc on dc.request_id = r.id
left join lateral public.deposit_route(r.id) route on true;
grant select on public.request_summaries to authenticated;

commit;
