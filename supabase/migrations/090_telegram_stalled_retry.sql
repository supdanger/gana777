-- BORRADOR. No ejecutado. Aplicar después del diagnóstico y revisión.
-- Conserva el envío inmediato y la frecuencia de reintento de cinco minutos.
begin;
select cron.unschedule(jobid) from cron.job where jobname = 'gana777-telegram-alerts';
select cron.schedule('gana777-telegram-alerts', '*/5 * * * *', $job$
  select net.http_post(
    url := config.url || '/functions/v1/send-telegram-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', config.secret),
    body := '{}'::jsonb, timeout_milliseconds := 30000
  ) from (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) as url,
      (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1) as secret
  ) config
  where config.url is not null and config.secret is not null and exists (
    select 1 from public.telegram_alerts
    where (status in ('pending', 'failed') and attempts < 10 and next_attempt_at <= now())
       or (status = 'sending' and claimed_at < now() - interval '5 minutes')
  )
$job$);
commit;
