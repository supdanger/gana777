begin;
alter table public.promotions add column daily_reset_time time;
alter table public.requests add column special_daily_reset_time time;
create or replace function public.zz_validate_special_bonus_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_offer public.promotions%rowtype;
begin
  if new.kind <> 'deposit' or new.bonus_id is null then return new; end if;
  select * into v_offer from public.promotions where id = new.bonus_id;
  if v_offer.cooldown_hours <= 0 then return new; end if;
  if v_offer.bonus_mode <> 'fixed' then raise exception 'El bono especial debe tener un monto fijo.'; end if;
  if exists (select 1 from public.special_bonus_uses u where u.user_id = new.user_id and u.promotion_id = new.bonus_id and u.next_available_at > now()) then
    raise exception 'El bono todavía no está disponible.';
  end if;
  if exists (select 1 from public.requests r left join public.deposit_credits dc on dc.request_id=r.id where r.user_id=new.user_id and r.bonus_id=new.bonus_id and r.status='approved' and dc.request_id is null) then
    raise exception 'Ya tenés una carga con este bono pendiente de acreditación.';
  end if;
  new.requested_special_bonus_id := new.bonus_id;
  new.special_cooldown_hours := case when v_offer.reward_type='free_spins' and v_offer.daily_reset_time is not null then 24 else v_offer.cooldown_hours end;
  new.special_daily_reset_time := v_offer.daily_reset_time;
  new.special_min_amount := v_offer.min_amount; new.special_max_amount := v_offer.max_amount;
  return new;
end $$;
do $$ declare d text; old text := 'v_credited_at + make_interval(hours => v_request.special_cooldown_hours)'; new text := 'case when v_request.special_daily_reset_time is not null then (((v_credited_at at time zone ''America/Asuncion'')::date + v_request.special_daily_reset_time + case when ((v_credited_at at time zone ''America/Asuncion'')::date + v_request.special_daily_reset_time) <= (v_credited_at at time zone ''America/Asuncion'') then interval ''1 day'' else interval ''0 day'' end) at time zone ''America/Asuncion'') else v_credited_at + make_interval(hours => v_request.special_cooldown_hours) end'; def text;
begin select pg_get_functiondef('public.confirm_deposit_credit(uuid)'::regprocedure) into def;
if position(old in def)=0 then raise exception 'No se encontró el cálculo de espera del bono'; end if;
execute replace(def,old,new); end $$;
create or replace function public.special_bonus_availability()
returns table(promotion_id uuid,next_available_at timestamptz,awaiting_credit boolean,server_now timestamptz)
language sql stable security definer set search_path = '' as $$
select p.id,last_use.next_available_at,
exists(select 1 from public.requests r left join public.deposit_credits dc on dc.request_id=r.id where r.user_id=auth.uid() and r.bonus_id=p.id and r.status in ('pending','approved') and dc.request_id is null),now()
from public.promotions p left join lateral (select u.next_available_at from public.special_bonus_uses u where u.user_id=auth.uid() and u.promotion_id=p.id order by u.used_at desc limit 1) last_use on true
where p.active and p.cooldown_hours>0;
$$;
commit;
