begin;

-- El cron sigue cada minuto para reintentar fallos. El envío nuevo no espera ese turno:
-- al entrar un aviso, esta función llama a send-telegram-alerts en cuanto se confirma la operación.
create or replace function public.notify_telegram_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.telegram_alerts
    where status = 'pending' and next_attempt_at <= now()
  ) then
    return null;
  end if;
  begin
    perform net.http_post(
      url := config.url || '/functions/v1/send-telegram-alerts',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', config.secret),
      body := '{}'::jsonb,
      timeout_milliseconds := 90000
    )
    from (
      select
        (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) as url,
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1) as secret
    ) config
    where config.url is not null and config.secret is not null;
  exception when others then
    raise warning 'No se pudo disparar el envío inmediato de Telegram.';
  end;
  return null;
end $$;

revoke all on function public.notify_telegram_dispatch() from public, anon, authenticated;
grant execute on function public.notify_telegram_dispatch() to service_role;

drop trigger if exists notify_telegram_dispatch on public.telegram_alerts;
create trigger notify_telegram_dispatch
  after insert on public.telegram_alerts
  for each statement
  execute function public.notify_telegram_dispatch();

commit;
