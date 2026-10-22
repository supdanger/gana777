begin;

-- Solo las solicitudes nuevas guardarán la IP pública observada por la función.
-- Las solicitudes anteriores conservan únicamente el hash irreversible.
alter table public.player_access_requests
  add column origin_ip inet,
  add column origin_user_agent text check (origin_user_agent is null or length(origin_user_agent) <= 512);

create function public.platform_player_stats(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'deposits', count(*) filter (where kind='deposit'),
    'approved_deposits', count(*) filter (where kind='deposit' and status='approved'),
    'approved_deposit_amount', coalesce(sum(amount) filter (where kind='deposit' and status='approved'),0),
    'withdrawals', count(*) filter (where kind='withdrawal'),
    'approved_withdrawals', count(*) filter (where kind='withdrawal' and status='approved'),
    'approved_withdrawal_amount', coalesce(sum(amount) filter (where kind='withdrawal' and status='approved'),0),
    'last_activity_at', max(created_at)
  ) from public.requests where user_id=p_user_id;
$$;
revoke all on function public.platform_player_stats(uuid) from public,anon,authenticated,service_role;
grant execute on function public.platform_player_stats(uuid) to service_role;

commit;
