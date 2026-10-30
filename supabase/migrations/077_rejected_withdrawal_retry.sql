-- Los rechazos permiten corregir los datos y volver a solicitar un retiro.
-- track_withdrawal_window conserva el bloqueo por pendientes y las 24 horas
-- desde approved_at. Las migraciones de bonos habían restaurado otra espera
-- desde created_at que también contaba solicitudes rechazadas.
begin;

do $$
declare
  definition text;
  obsolete_check text := $check$  if new.kind = 'withdrawal' and exists (
    select 1 from public.requests where user_id = new.user_id and kind = 'withdrawal'
      and created_at > now() - interval '24 hours'
  ) then raise exception 'Solo podés solicitar un retiro cada 24 horas.'; end if;$check$;
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.requests'::regclass
      and tgname = 'track_withdrawal_window' and tgenabled = 'O'
      and tgfoid = 'public.track_withdrawal_window()'::regprocedure
  ) then
    raise exception 'Falta la validación de retiros pendientes y acreditados.';
  end if;
  select pg_get_functiondef('public.validate_request()'::regprocedure) into definition;
  if position(obsolete_check in definition) = 0 then
    raise exception 'validate_request cambió: revisar la condición antes de aplicar esta migración.';
  end if;
  execute replace(definition, obsolete_check, '  -- La ventana de retiros se valida en track_withdrawal_window.');
end $$;

commit;
