-- Los bonos de carga pueden entregar dinero promocional o giros gratis.
begin;

alter table public.promotions
  add column reward_type text not null default 'cash',
  add column reward_label text not null default '';
alter table public.promotions drop constraint if exists promotions_bonus_rule;
alter table public.promotions drop constraint if exists promotions_special_fixed;
alter table public.promotions add constraint promotions_reward_type check (reward_type in ('cash', 'free_spins'));
alter table public.promotions add constraint promotions_bonus_rule check (
    (not selectable and bonus_amount = 0 and min_amount = 0 and max_amount = 0 and reward_type = 'cash' and reward_label = '')
    or (selectable and min_amount > 0 and max_amount >= min_amount and (
      (reward_type = 'cash' and reward_label = '' and (
        (bonus_mode = 'percent' and bonus_percent > 0 and bonus_amount = 0)
        or (bonus_mode = 'fixed' and bonus_amount > 0 and bonus_percent = 0)
      ))
      or (reward_type = 'free_spins' and length(btrim(reward_label)) between 2 and 80 and bonus_percent = 0 and bonus_amount = 0)
    )));
alter table public.promotions add constraint promotions_special_fixed check (
    cooldown_hours = 0 or (selectable and (
      (reward_type = 'cash' and bonus_mode = 'fixed' and bonus_amount > 0)
      or (reward_type = 'free_spins' and length(btrim(reward_label)) between 2 and 80)
    ))
  );

alter table public.requests
  add column bonus_reward_type text not null default 'cash',
  add column bonus_reward_label text not null default '';
alter table public.requests add constraint requests_bonus_reward_type check (bonus_reward_type in ('cash', 'free_spins'));
alter table public.requests add constraint requests_bonus_reward_label check (
    length(bonus_reward_label) <= 80 and
    ((bonus_reward_type = 'cash' and bonus_reward_label = '')
      or (bonus_reward_type = 'free_spins' and length(btrim(bonus_reward_label)) between 2 and 80))
  );
alter table public.requests add constraint requests_withdrawal_bonus_reward check (
    kind <> 'withdrawal' or (bonus_reward_type = 'cash' and bonus_reward_label = '')
  );

create or replace function public.validate_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  offer public.promotions%rowtype;
  assignment public.bank_account_assignments%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if new.kind = 'withdrawal' and exists (
    select 1 from public.requests where user_id = new.user_id and kind = 'withdrawal'
      and created_at > now() - interval '24 hours'
  ) then raise exception 'Solo podés solicitar un retiro cada 24 horas.'; end if;
  if new.kind = 'deposit' then
    if new.bank_assignment_id is null then raise exception 'La cuenta asignada ya no está disponible.'; end if;
    select * into assignment from public.bank_account_assignments
    where id = new.bank_assignment_id and user_id = new.user_id and status = 'reserved'
      and expires_at > now() for update;
    if not found then raise exception 'La asignación de la cuenta venció. Volvé a iniciar la carga.'; end if;
    new.bank_account_id := assignment.bank_account_id;
    if new.receipt_url is null or new.cloudinary_asset_id is null then
      raise exception 'El comprobante debe subirse mediante Cloudinary.';
    end if;
    if new.bonus_id is not null then
      select * into offer from public.promotions
      where id = new.bonus_id and active and selectable
        and ((new.amount >= min_amount and new.amount <= max_amount)
          or (cooldown_hours > 0 and reward_type = 'cash'))
        and (
          (reward_type = 'cash' and ((bonus_mode = 'percent' and bonus_percent > 0 and bonus_amount = 0)
            or (bonus_mode = 'fixed' and bonus_amount > 0 and bonus_percent = 0)))
          or (reward_type = 'free_spins' and bonus_percent = 0 and bonus_amount = 0
            and length(btrim(reward_label)) between 2 and 80)
        );
      if not found then raise exception 'El bono no está habilitado para ese monto.'; end if;
      new.bonus_reward_type := offer.reward_type;
      new.bonus_reward_label := offer.reward_label;
      if offer.reward_type = 'free_spins' then
        new.bonus_percent := 0; new.bonus_amount := 0;
      elsif offer.bonus_mode = 'fixed' then
        new.bonus_percent := 0; new.bonus_amount := offer.bonus_amount;
      else
        new.bonus_percent := offer.bonus_percent; new.bonus_amount := 0;
      end if;
    else
      new.bonus_percent := 0; new.bonus_amount := 0;
      new.bonus_reward_type := 'cash'; new.bonus_reward_label := '';
    end if;
    update public.bank_account_assignments set status = 'confirmed', confirmed_at = now()
      where id = assignment.id;
    update public.bank_accounts set usage_count = usage_count + 1
      where id = assignment.bank_account_id;
  end if;
  return new;
end $$;
revoke all on function public.validate_request() from public, anon, authenticated;

create or replace function public.zz_validate_special_bonus_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_offer public.promotions%rowtype;
begin
  if new.kind <> 'deposit' or new.bonus_id is null then return new; end if;
  select * into v_offer from public.promotions where id = new.bonus_id;
  if v_offer.cooldown_hours <= 0 then return new; end if;
  if not ((v_offer.reward_type = 'cash' and v_offer.bonus_mode = 'fixed' and v_offer.bonus_amount > 0)
    or (v_offer.reward_type = 'free_spins' and length(btrim(v_offer.reward_label)) between 2 and 80)) then
    raise exception 'El bono especial no tiene un premio válido.';
  end if;
  if exists (
    select 1 from public.special_bonus_uses u where u.user_id = new.user_id
      and u.promotion_id = new.bonus_id and u.next_available_at > now()
  ) then raise exception 'El bono especial todavía está en espera.'; end if;
  if exists (
    select 1 from public.requests r left join public.deposit_credits dc on dc.request_id = r.id
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

create or replace view public.request_summaries with (security_invoker = true) as
select r.id, r.user_id, coalesce(p.username, p.display_name, 'Usuario') as user_name, r.kind, r.amount, r.status, r.created_at,
  r.holder, r.cbu, r.alias, r.receipt_path,
  to_jsonb(r)->>'receipt_url' as receipt_url,
  (to_jsonb(r)->>'bonus_id')::uuid as bonus_id,
  coalesce((to_jsonb(r)->>'bonus_percent')::numeric, 0) as bonus_percent,
  coalesce(r.bonus_amount, 0) as bonus_amount,
  r.approved_at, dc.credited_at, route.deposit_holder, route.deposit_phone, route.deposit_sac,
  r.requested_special_bonus_id, r.special_min_amount, r.special_max_amount,
  r.bonus_reward_type, r.bonus_reward_label
from public.requests r
left join public.user_profiles p on p.user_id = r.user_id
left join public.deposit_credits dc on dc.request_id = r.id
left join lateral public.deposit_route(r.id) route on true;
grant select on public.request_summaries to authenticated;

commit;
