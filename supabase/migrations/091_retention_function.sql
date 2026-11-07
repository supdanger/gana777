-- BORRADOR. Instalar esta función NO borra datos y NO programa un cron.
-- Primero: select * from public.optimization_retention(); -- simulación
-- Después de revisar y respaldar, invocar explícitamente p_dry_run := false.
begin;
create or replace function public.optimization_retention(
  p_dry_run boolean default true,
  p_batch_size integer default 500,
  p_cron_days integer default 14,
  p_telegram_days integer default 30
) returns table(category text, candidates bigint, deleted bigint)
language plpgsql security definer set search_path = '' as $$
declare v_limit integer := least(greatest(coalesce(p_batch_size, 500), 1), 2000);
begin
  if p_dry_run is null or p_cron_days is null or p_telegram_days is null
    or p_cron_days < 7 or p_telegram_days < 14 then
    raise exception 'Revisá el modo y los plazos mínimos de retención.';
  end if;
  -- No solapar dos tareas de mantenimiento.
  if not pg_catalog.pg_try_advisory_xact_lock(777090) then
    raise exception 'Ya hay una limpieza en ejecución.';
  end if;

  category := 'cron_job_run_details'; deleted := 0;
  if p_dry_run then
    select count(*) into candidates from cron.job_run_details
      where end_time < now() - make_interval(days => p_cron_days);
  else
    with batch as (
      select runid from cron.job_run_details
      where end_time < now() - make_interval(days => p_cron_days)
      order by end_time, runid limit v_limit for update skip locked
    ) delete from cron.job_run_details r using batch b where r.runid = b.runid;
    get diagnostics deleted = row_count;
    candidates := deleted; -- tamaño del lote; no volver a contar toda la tabla
  end if;
  return next;

  category := 'telegram_terminal'; deleted := 0;
  if p_dry_run then
    select count(*) into candidates from public.telegram_alerts
      where status in ('sent', 'skipped') and created_at < now() - make_interval(days => p_telegram_days);
  else
    with batch as (
      select id from public.telegram_alerts where status in ('sent', 'skipped')
        and created_at < now() - make_interval(days => p_telegram_days)
      order by created_at, id limit v_limit for update skip locked
    ) delete from public.telegram_alerts a using batch b where a.id = b.id;
    get diagnostics deleted = row_count;
    candidates := deleted; -- tamaño del lote; no volver a contar toda la tabla
  end if;
  return next;

  category := 'receipt_upload_attempts'; deleted := 0;
  if p_dry_run then
    select count(*) into candidates from public.receipt_upload_attempts
      where created_at < now() - interval '7 days';
  else
    with batch as (
      select ctid from public.receipt_upload_attempts where created_at < now() - interval '7 days'
      order by created_at limit v_limit for update skip locked
    ) delete from public.receipt_upload_attempts a using batch b where a.ctid = b.ctid;
    get diagnostics deleted = row_count;
    candidates := deleted; -- tamaño del lote; no volver a contar toda la tabla
  end if;
  return next;
end;
$$;
revoke all on function public.optimization_retention(boolean, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.optimization_retention(boolean, integer, integer, integer) to service_role;
commit;
