-- Ranking de jugadores por cargas acreditadas para el inicio del panel.
begin;

create or replace function public.get_deposit_leaderboard(p_period text)
returns table(user_id uuid, user_name text, total_amount numeric, load_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_start timestamptz;
begin
  if not public.has_admin_permission('home') then
    raise exception 'No tenés permiso para ver el inicio del panel.' using errcode = '42501';
  end if;

  case p_period
    when 'day' then
      v_start := date_trunc('day', now() at time zone 'America/Asuncion') at time zone 'America/Asuncion';
    when 'week' then
      v_start := date_trunc('week', now() at time zone 'America/Asuncion') at time zone 'America/Asuncion';
    when 'month' then
      v_start := date_trunc('month', now() at time zone 'America/Asuncion') at time zone 'America/Asuncion';
    else
      raise exception 'Período de ranking inválido.' using errcode = '22023';
  end case;

  return query
    select dc.user_id,
      coalesce(nullif(btrim(p.username), ''), nullif(btrim(p.display_name), ''), 'Jugador'),
      sum(r.amount)::numeric,
      count(*)::bigint
    from public.deposit_credits dc
    join public.requests r on r.id = dc.request_id
    join public.user_profiles p on p.user_id = dc.user_id
    where dc.credited_at >= v_start
      and dc.credited_at <= now()
      and r.kind = 'deposit'
      and r.status = 'approved'
    group by dc.user_id, p.username, p.display_name
    order by sum(r.amount) desc, count(*) desc, lower(coalesce(nullif(btrim(p.username), ''), nullif(btrim(p.display_name), ''), 'Jugador'))
    limit 10;
end;
$$;

revoke all on function public.get_deposit_leaderboard(text) from public, anon, authenticated;
grant execute on function public.get_deposit_leaderboard(text) to authenticated;

commit;
