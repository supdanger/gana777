-- Totales de bonos por tipo, sin bajar cada carga al panel.
begin;

drop view if exists public.deposit_bonus_totals;
create view public.deposit_bonus_totals with (security_invoker = true) as
select
  r.bonus_percent,
  coalesce(
    max(p.title),
    case
      when r.bonus_percent > 0 then '+' || trim(to_char(r.bonus_percent, 'FM990')) || '%'
      else 'Sin bono'
    end
  ) as title,
  count(*)::integer as loads,
  coalesce(sum(round(r.amount * r.bonus_percent / 100, 2)), 0) as bonus_total
from public.requests r
left join public.promotions p on p.id = r.bonus_id
where r.kind = 'deposit'
  and r.status in ('pending', 'approved')
group by r.bonus_id, r.bonus_percent;

revoke all on public.deposit_bonus_totals from public, anon, authenticated;
grant select on public.deposit_bonus_totals to authenticated;

commit;
