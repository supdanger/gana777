begin;

-- Mínimo sobre el total de las nuevas solicitudes, también por REST o RPC.
-- No modifica retiros anteriores, sus pagos parciales ni el ajuste administrativo.
create or replace function public.enforce_minimum_withdrawal_amount() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'withdrawal' and new.amount < 5000 then
    raise exception using errcode = '22023', message = 'El retiro mínimo es de $5.000.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_minimum_withdrawal_amount() from public, anon, authenticated;
drop trigger if exists enforce_minimum_withdrawal_amount on public.requests;
create trigger enforce_minimum_withdrawal_amount
before insert on public.requests
for each row execute function public.enforce_minimum_withdrawal_amount();

commit;
