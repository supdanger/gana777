import { cors, HttpError, json, serverClient } from '../_shared/http.ts';
import { cloudName, receiptViewUrl, storedReceipt } from '../_shared/cloudinary.ts';
import { bonusPesos, receiptMedia, telegramAlertText, type TelegramAlert } from '../_shared/telegram-alert.ts';

type Route = { route: string; chat_id: string | null; enabled: boolean };
type ReceiptFile = { bytes: Uint8Array; mime: string; field: 'photo' | 'document'; filename: string };
type Prepared =
  | { status: 'skip' }
  | { status: 'error'; code: string }
  | { status: 'send'; text: string; file: ReceiptFile | null; fallbackText: string | null };

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const receiptPathPattern = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,180}\.(png|jpe?g|webp|pdf)$/i;

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
          const prepared = alert.event_type === 'deposit' || alert.event_type === 'withdrawal'
            ? await prepareOperation(service, alert)
            : { status: 'send' as const, text: telegramAlertText(alert), file: null, fallbackText: null };
          if (prepared.status === 'skip') status = 'skipped';
          else if (prepared.status === 'error') errorCode = prepared.code;
          else {
            let delivery = await deliver(token, route.chat_id, prepared.text, prepared.file);
            if (!delivery.ok && prepared.file && prepared.fallbackText && alert.attempts >= 10) {
              delivery = await deliver(token, route.chat_id, prepared.fallbackText, null);
            }
            if (delivery.ok) { status = 'sent'; messageId = delivery.messageId; sent++; }
            else errorCode = delivery.errorCode;
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

async function prepareOperation(service: ReturnType<typeof serverClient>, alert: TelegramAlert): Promise<Prepared> {
  const columns = alert.event_type === 'deposit'
    ? 'status,amount,bonus_percent,bonus_amount,receipt_url,receipt_path'
    : 'status';
  const { data: operation, error } = await service.from('requests')
    .select(columns).eq('id', String(alert.payload.request_id ?? '')).maybeSingle();
  if (error) return { status: 'error', code: 'request_lookup' };
  if (!operation || operation.status !== 'pending') return { status: 'skip' };
  if (alert.event_type !== 'deposit') return { status: 'send', text: telegramAlertText(alert), file: null, fallbackText: null };
  const bonus = bonusPesos(Number(operation.amount) || 0, Number(operation.bonus_percent) || 0, Number(operation.bonus_amount) || 0);
  const receipt = await loadReceipt(service, operation.receipt_url, operation.receipt_path);
  if (receipt.status === 'file') {
    return {
      status: 'send',
      text: telegramAlertText(alert, { bonus }),
      file: receipt.file,
      fallbackText: telegramAlertText(alert, { bonus, receiptUnavailable: true }),
    };
  }
  if (receipt.status === 'missing' || alert.attempts >= 10) {
    return { status: 'send', text: telegramAlertText(alert, { bonus, receiptUnavailable: true }), file: null, fallbackText: null };
  }
  return { status: 'error', code: 'receipt_fetch' };
}

async function loadReceipt(
  service: ReturnType<typeof serverClient>,
  receiptUrl: string | null,
  receiptPath: string | null,
): Promise<{ status: 'file'; file: ReceiptFile } | { status: 'missing' } | { status: 'retry' }> {
  const source = await receiptSource(service, receiptUrl, receiptPath);
  if (source.status !== 'url') return source;
  try {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { status: 'retry' };
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_RECEIPT_BYTES) return { status: 'missing' };
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) return { status: 'retry' };
    if (bytes.byteLength > MAX_RECEIPT_BYTES) return { status: 'missing' };
    const media = receiptMedia(source.format);
    if (!media) return { status: 'missing' };
    return { status: 'file', file: { bytes, ...media } };
  } catch {
    return { status: 'retry' };
  }
}

async function receiptSource(
  service: ReturnType<typeof serverClient>,
  receiptUrl: string | null,
  receiptPath: string | null,
): Promise<{ status: 'url'; url: string; format: string } | { status: 'missing' } | { status: 'retry' }> {
  if (typeof receiptUrl === 'string' && receiptUrl) {
    try {
      const stored = storedReceipt(receiptUrl, cloudName());
      if (!stored) return { status: 'missing' };
      return { status: 'url', url: await receiptViewUrl(receiptUrl), format: stored.format };
    } catch {
      return { status: 'retry' };
    }
  }
  if (typeof receiptPath === 'string' && receiptPathPattern.test(receiptPath)) {
    const format = receiptPath.split('.').pop() ?? '';
    const signed = await service.storage.from('receipts').createSignedUrl(receiptPath, 120);
    if (signed.error || !signed.data?.signedUrl) return { status: 'retry' };
    return { status: 'url', url: signed.data.signedUrl, format };
  }
  return { status: 'missing' };
}

async function deliver(token: string, chatId: string, text: string, file: ReceiptFile | null): Promise<{ ok: boolean; messageId: number | null; errorCode: string }> {
  try {
    const response = file
      ? await fetch(`https://api.telegram.org/bot${token}/${file.field === 'photo' ? 'sendPhoto' : 'sendDocument'}`, {
        method: 'POST',
        body: telegramFile(chatId, text, file),
        signal: AbortSignal.timeout(20000),
      })
      : await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(8000),
      });
    if (!response.ok) return { ok: false, messageId: null, errorCode: `telegram_${response.status}` };
    const result = await response.json();
    if (!result.ok) return { ok: false, messageId: null, errorCode: 'telegram_response' };
    return { ok: true, messageId: Number(result.result?.message_id) || null, errorCode: '' };
  } catch {
    return { ok: false, messageId: null, errorCode: 'telegram_network' };
  }
}

function telegramFile(chatId: string, text: string, file: ReceiptFile): FormData {
  const body = new FormData();
  body.set('chat_id', chatId);
  body.set('caption', text);
  body.set(file.field, new Blob([file.bytes], { type: file.mime }), file.filename);
  return body;
}
