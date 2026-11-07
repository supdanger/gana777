-- Los avisos nuevos de Telegram siguen saliendo al instante con notify_telegram_dispatch.
-- Este trabajo solo reintenta, y no llama a la función si la cola está vacía.
-- El push de anuncios mantiene la precisión de un minuto, pero tampoco llama a la función en vacío.
-- dispatch_scheduled_announcements sigue cada minuto: el horario del anuncio es al minuto y, si no toca ninguno, la función sale enseguida.

begin;

select cron.unschedule(jobid) from cron.job where jobname = 'gana777-telegram-alerts';
select cron.schedule('gana777-telegram-alerts', '*/5 * * * *', $job$
  select net.http_post(
    url := config.url || '/functions/v1/send-telegram-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', config.secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) from (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) as url,
      (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1) as secret
  ) config
  where config.url is not null
    and config.secret is not null
    and exists (
      select 1 from public.telegram_alerts
      where status in ('pending', 'failed') and next_attempt_at <= now()
    )
$job$);

select cron.unschedule(jobid) from cron.job where jobname = 'gana777-announcement-push';
select cron.schedule('gana777-announcement-push', '* * * * *', $job$
  select net.http_post(
    url := config.url || '/functions/v1/send-announcement-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', config.secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) from (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) as url,
      (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1) as secret
  ) config
  where config.url is not null
    and config.secret is not null
    and exists (
      select 1 from public.user_notifications n
      where n.kind = 'announcement'
        and n.push_sent_at is null
        and (n.push_claimed_at is null or n.push_claimed_at < now() - interval '5 minutes')
    )
$job$);

commit;
