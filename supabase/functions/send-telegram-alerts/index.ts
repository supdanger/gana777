import { cors, HttpError, json, serverClient } from '../_shared/http.ts';
import { telegramAlertText, type TelegramAlert } from '../_shared/telegram-alert.ts';

type Route = { route: string; chat_id: string | null; enabled: boolean };

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    const service = serverClient();
    const { data: authorized, error: authError } = await service.rpc('verify_telegram_job_key', {
      p_key: request.headers.get('apikey') ?? '',
    });
    if (authError || !authorized) throw new HttpError(401, 'No autorizado.');
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN')?.trim();
    if (!token) throw new HttpError(503, 'Configurá TELEGRAM_BOT_TOKEN en Supabase.');
    const { data, error } = await service.rpc('claim_telegram_alert_batch', { p_limit: 10 });
    if (error) throw new HttpError(503, 'No pudimos consultar los avisos pendientes.');
    const alerts = (data ?? []) as TelegramAlert[];
    if (!alerts.length) return json({ processed: 0, sent: 0 });
    const { data: configured, error: routesError } = await service.from('telegram_routes').select('route,chat_id,enabled');
    if (routesError) throw new HttpError(503, 'No pudimos consultar los grupos de Telegram.');
    const routes = new Map(((configured ?? []) as Route[]).map(route => [route.route, route]));
    let sent = 0;
    let cursor = 0;
    async function processAlert() {
      while (cursor < alerts.length) {
        const alert = alerts[cursor++];
        const route = routes.get(alert.route);
        let status: 'sent' | 'failed' | 'skipped' | 'dead' = 'failed';
        let errorCode: string | null = null;
        let messageId: number | null = null;
        if (!route?.enabled || !route.chat_id) status = 'skipped';
        else {
          if (alert.event_type === 'deposit' || alert.event_type === 'withdrawal') {
            const { data: operation, error: operationError } = await service.from('requests')
              .select('status').eq('id', String(alert.payload.request_id ?? '')).maybeSingle();
            if (operationError) errorCode = 'request_lookup';
            else if (!operation || operation.status !== 'pending') status = 'skipped';
          }
          if (status !== 'skipped' && !errorCode) {
            try {
              const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: route.chat_id, text: telegramAlertText(alert), disable_web_page_preview: true }),
                signal: AbortSignal.timeout(5000),
              });
              if (response.ok) {
                const result = await response.json();
                if (result.ok) { status = 'sent'; messageId = Number(result.result?.message_id) || null; sent++; }
                else errorCode = 'telegram_response';
              } else errorCode = `telegram_${response.status}`;
            } catch { errorCode = 'telegram_network'; }
          }
        }
        if (status === 'failed' && alert.attempts >= 10) status = 'dead';
        const retrySeconds = Math.min(3600, 30 * 2 ** Math.max(0, alert.attempts - 1));
        const { error: updateError } = await service.from('telegram_alerts').update({
          status, sent_at: status === 'sent' ? new Date().toISOString() : null,
          telegram_message_id: messageId, last_error: status === 'failed' || status === 'dead' ? errorCode : null,
          next_attempt_at: new Date(Date.now() + retrySeconds * 1000).toISOString(),
          claimed_at: null,
        }).eq('id', alert.id).eq('status', 'sending').eq('attempts', alert.attempts);
        if (updateError) console.error('telegram alert update failed', { type: updateError.code ?? 'unknown' });
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, alerts.length) }, processAlert));
    return json({ processed: alerts.length, sent });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error('send-telegram-alerts failed', { type: error instanceof Error ? error.name : 'unknown' });
    return json({ error: 'No pudimos procesar los avisos de Telegram.' }, 500);
  }
});
