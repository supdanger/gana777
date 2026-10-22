import { sacShiftMessage } from '../_shared/sac-message.ts';
import { authenticate, cors, HttpError, json, serverClient } from '../_shared/http.ts';

const eventIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const chatIdPattern = /^-?\d{1,20}$/;

type ShiftEvent = {
  id: string;
  sac_number: number;
  operator_name: string;
  action: string;
  phones: number[] | null;
  telegram_status: string;
};

function telegramConfig(): { token: string; chatId: string } | null {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')?.trim() ?? '';
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID')?.trim() ?? '';
  if (!token || !chatId || token.length > 200 || !chatIdPattern.test(chatId)) return null;
  return { token, chatId };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    const { db } = await authenticate(request);
    const [deposit, shifts] = await Promise.all([
      db.rpc('has_admin_permission', { permission_name: 'deposit' }),
      db.rpc('has_admin_permission', { permission_name: 'shifts' }),
    ]);
    if (deposit.error || shifts.error || (!deposit.data && !shifts.data)) throw new HttpError(403, 'No tenés permiso para avisar este turno.');
    const input = await request.json().catch(() => null) as { event_id?: unknown } | null;
    const eventId = typeof input?.event_id === 'string' ? input.event_id : '';
    if (!eventIdPattern.test(eventId)) throw new HttpError(400, 'Aviso de turno inválido.');
    const service = serverClient();
    const { data, error } = await service.from('sac_shift_events')
      .select('id,sac_number,operator_name,action,phones,telegram_status').eq('id', eventId).maybeSingle();
    if (error || !data) throw new HttpError(404, 'No encontramos el aviso de ese turno.');
    const event = data as ShiftEvent;
    if (event.telegram_status === 'sent') return json({ ok: true, delivered: true, already_sent: true });
    if (event.telegram_status !== 'pending') return json({ ok: true, delivered: false, reason: event.telegram_status === 'skipped' ? 'missing_config' : 'telegram' });
    const config = telegramConfig();
    if (!config) {
      await service.from('sac_shift_events').update({ telegram_status: 'skipped' }).eq('id', eventId).eq('telegram_status', 'pending');
      return json({ ok: true, delivered: false, reason: 'missing_config' });
    }
    const { data: claimed, error: claimError } = await service.from('sac_shift_events')
      .update({ telegram_status: 'sending' }).eq('id', eventId).eq('telegram_status', 'pending').select('id');
    if (claimError || !claimed?.length) return json({ ok: true, delivered: false, reason: 'telegram' });
    const phones = Array.isArray(event.phones) ? event.phones.filter(phone => Number.isInteger(phone)) : [];
    const text = sacShiftMessage(event.action === 'end' ? 'end' : 'start', event.operator_name, event.sac_number, phones);
    let delivered = false;
    try {
      const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(8000),
      });
      delivered = response.ok;
    } catch {
      delivered = false;
    }
    await service.from('sac_shift_events').update({ telegram_status: delivered ? 'sent' : 'failed' }).eq('id', eventId).eq('telegram_status', 'sending');
    return json({ ok: true, delivered, reason: delivered ? undefined : 'telegram' });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error('notify-sac-shift failed', { type: error instanceof Error ? error.name : 'unknown' });
    return json({ error: 'No pudimos enviar el aviso de Telegram.' }, 500);
  }
});
