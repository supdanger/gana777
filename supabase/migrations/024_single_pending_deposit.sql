begin;

create index if not exists requests_pending_deposit_user
  on public.requests(user_id) where kind = 'deposit' and status = 'pending';

create or replace function public.prevent_pending_deposit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'deposit' then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
    if exists (
      select 1 from public.requests r
      where r.user_id = new.user_id and r.kind = 'deposit' and r.status = 'pending'
    ) then
      raise exception 'Ya tenés una carga pendiente. Esperá a que sea aprobada o rechazada.';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.prevent_pending_deposit() from public, anon, authenticated;
drop trigger if exists prevent_pending_deposit on public.requests;
create trigger prevent_pending_deposit before insert on public.requests
for each row execute function public.prevent_pending_deposit();

create or replace view public.request_summaries with (security_invoker = true) as
select r.id, r.user_id, coalesce(p.username, p.display_name, 'Usuario') as user_name, r.kind, r.amount, r.status, r.created_at,
  r.holder, r.cbu, r.alias, r.receipt_path,
  to_jsonb(r)->>'receipt_url' as receipt_url,
  (to_jsonb(r)->>'bonus_id')::uuid as bonus_id,
  coalesce((to_jsonb(r)->>'bonus_percent')::numeric, 0) as bonus_percent,
  coalesce(r.bonus_amount, 0) as bonus_amount,
  r.approved_at
from public.requests r
left join public.user_profiles p on p.user_id = r.user_id;

commit;
