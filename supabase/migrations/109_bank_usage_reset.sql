-- Al habilitar, pausar, mover de turno o crear una cuenta activa, los contadores
-- de ese turno vuelven a cero. El reparto de siempre sigue eligiendo la de menor uso:
-- con todas en cero, se turnan. Poner en cero solo la cuenta nueva la dejaría primera
-- y volvería a recibir todas las cargas hasta alcanzar a las demás.
-- El trigger no incluye usage_count: confirmar una carga suma ese contador y no pasa por acá.
-- Postgres no admite tablas de transición junto con UPDATE OF, por eso es por fila.
begin;

create function public.reset_bank_usage_on_availability() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if not new.active then return null; end if;
    update public.bank_accounts set usage_count=0
      where shift_key=new.shift_key and usage_count<>0;
    return null;
  end if;
  if new.active is not distinct from old.active
     and new.shift_key is not distinct from old.shift_key then
    return null;
  end if;
  if new.shift_key is distinct from old.shift_key and (new.active or old.active) then
    update public.bank_accounts set usage_count=0
      where usage_count<>0 and shift_key in (old.shift_key, new.shift_key);
    return null;
  end if;
  update public.bank_accounts set usage_count=0
    where shift_key=new.shift_key and usage_count<>0;
  return null;
end;
$$;
revoke all on function public.reset_bank_usage_on_availability() from public, anon, authenticated;

create trigger bank_accounts_reset_usage_insert
  after insert on public.bank_accounts
  for each row execute function public.reset_bank_usage_on_availability();

create trigger bank_accounts_reset_usage_update
  after update of active, shift_key on public.bank_accounts
  for each row execute function public.reset_bank_usage_on_availability();

commit;
