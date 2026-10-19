-- Ejecutar después de 005. Aprobar un retiro significa confirmar que fue acreditado.
begin;
alter table public.requests add column if not exists approved_at timestamptz;
alter table public.requests disable trigger guard_request_input;
update public.requests r set approved_at = coalesce(
  (select max(e.created_at) from public.request_events e where e.request_id = r.id and e.new_status = 'approved'), r.created_at
) where r.status = 'approved' and r.approved_at is null;
alter table public.requests enable trigger guard_request_input;

-- Conserva la validación de comprobantes/bonos instalada por 001 o 002;
-- reemplaza solamente su antigua condición de espera desde created_at.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.validate_request()'::regprocedure) into definition;
  if position('if new.kind = ''withdrawal'' and exists (' in definition) > 0 then
    definition := replace(definition, 'if new.kind = ''withdrawal'' and exists (', 'if false and exists (');
    execute definition;
  elsif position('if false and exists (' in definition) = 0 then
    raise exception 'La función validate_request no coincide con las migraciones 001/002.';
  end if;
end $$;

create or replace function public.track_withdrawal_window() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'withdrawal' then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
    if tg_op = 'INSERT' then
      if exists(select 1 from public.requests where user_id = new.user_id and kind = 'withdrawal' and status = 'pending') then
        raise exception 'Ya tenés un retiro pendiente de acreditación.';
      end if;
      if exists(select 1 from public.requests where user_id = new.user_id and kind = 'withdrawal'
        and status = 'approved' and approved_at > now() - interval '24 hours') then
        raise exception 'Debés esperar 24 horas desde la acreditación de tu último retiro.';
      end if;
    end if;
  end if;
  if tg_op = 'INSERT' then new.approved_at := null;
  elsif old.status = 'pending' and new.status = 'approved' then new.approved_at := now();
  else new.approved_at := old.approved_at;
  end if;
  return new;
end $$;
revoke all on function public.track_withdrawal_window() from public, anon, authenticated;
-- Orden: guard_request_input valida los campos antes de asignar la fecha del servidor.
drop trigger if exists track_withdrawal_window on public.requests;
create trigger track_withdrawal_window before insert or update on public.requests
for each row execute function public.track_withdrawal_window();

create or replace view public.request_summaries with (security_invoker = true) as
select r.id,r.user_id,r.kind,r.amount,r.status,r.created_at,r.holder,r.cbu,r.alias,r.receipt_path,
  to_jsonb(r)->>'receipt_url' as receipt_url,
  (to_jsonb(r)->>'bonus_id')::uuid as bonus_id,
  coalesce((to_jsonb(r)->>'bonus_percent')::numeric,0) as bonus_percent,
  r.approved_at
from public.requests r;
revoke all on public.request_summaries from public, anon, authenticated;
grant select on public.request_summaries to authenticated;
commit;
