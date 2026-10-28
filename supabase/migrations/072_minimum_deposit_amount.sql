begin;

-- Aplica el mínimo también a inserciones directas que no pasen por la función web.
create or replace function public.enforce_minimum_deposit_amount() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'deposit' and new.amount < 1000 then
    raise exception 'El monto mínimo para cargar es de $1.000.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_minimum_deposit_amount() from public, anon, authenticated;
drop trigger if exists enforce_minimum_deposit_amount on public.requests;
create trigger enforce_minimum_deposit_amount
before insert or update of kind, amount on public.requests
for each row execute function public.enforce_minimum_deposit_amount();

commit;
