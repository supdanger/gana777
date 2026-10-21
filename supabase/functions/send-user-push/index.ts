import webpush from 'npm:web-push@3.6.7';
import { authenticate, cors, HttpError, json, serverClient } from '../_shared/http.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    const { db, user } = await authenticate(request);
    const input = await request.json();
    const notificationId = typeof input.notification_id === 'string' ? input.notification_id : null;
    const requestId = typeof input.request_id === 'string' ? input.request_id : null;
    const messageId = typeof input.message_id === 'string' ? input.message_id : null;
    const partNumber = Number(input.part_number);
    const isPart = requestId && Number.isInteger(partNumber) && partNumber > 0;
    if (!uuid.test(notificationId ?? requestId ?? messageId ?? '')) throw new HttpError(400, 'Aviso inválido.');
    if ((requestId && !uuid.test(requestId)) || (messageId && !uuid.test(messageId))) throw new HttpError(400, 'Aviso inválido.');
    const service = serverClient();
    let query = service.from('user_notifications').select('id,user_id,request_id,part_number,message_id,kind,title,body,push_sent_at');
    if (notificationId) query = query.eq('id', notificationId);
    else if (messageId) query = query.eq('message_id', messageId).eq('kind', 'chat_message');
    else if (isPart) query = query.eq('request_id', requestId).eq('part_number', partNumber).eq('kind', 'withdrawal_paid');
    else if (requestId) query = query.eq('request_id', requestId).eq('kind', 'deposit_credited');
    else throw new HttpError(400, 'Aviso inválido.');
    const { data: notification, error: notificationError } = await query.maybeSingle();
    if (notificationError || !notification) throw new HttpError(404, 'No encontramos el aviso.');
    const permission = notification.kind === 'deposit_credited' ? 'deposit'
      : notification.kind === 'withdrawal_paid' ? 'withdrawal' : 'chat';
    const { data: permitted, error: permissionError } = await db.rpc('has_admin_permission', { permission_name: permission });
    if (permissionError || !permitted) throw new HttpError(403, 'No tenés permiso para enviar este aviso.');
    if (notification.push_sent_at) return json({ sent: 0, already_sent: true });

    if (notification.kind === 'deposit_credited') {
      const { data: credit, error } = await service.from('deposit_credits').select('request_id')
        .eq('request_id', notification.request_id).eq('user_id', notification.user_id).maybeSingle();
      if (error || !credit) throw new HttpError(409, 'La carga no está acreditada.');
    } else if (notification.kind === 'withdrawal_paid') {
      const { data: part, error } = await service.from('withdrawal_parts').select('request_id,paid_at')
        .eq('request_id', notification.request_id).eq('part_number', notification.part_number).maybeSingle();
      const { data: withdrawal, error: requestError } = await service.from('requests').select('user_id,kind')
        .eq('id', notification.request_id).maybeSingle();
      if (error || requestError || !part?.paid_at || withdrawal?.kind !== 'withdrawal'
        || withdrawal.user_id !== notification.user_id) throw new HttpError(409, 'El retiro no está acreditado.');
    } else if (notification.kind === 'chat_message') {
      const { data: message, error } = await service.from('messages').select('id,user_id,sender_id')
        .eq('id', notification.message_id).maybeSingle();
      if (error || !message || message.user_id !== notification.user_id || message.sender_id !== user.id)
        throw new HttpError(409, 'El mensaje no corresponde a este aviso.');
    } else throw new HttpError(400, 'Tipo de aviso inválido.');

    const { data: subscriptions, error: subscriptionsError } = await service.from('push_subscriptions')
      .select('endpoint,p256dh,auth_secret').eq('user_id', notification.user_id);
    if (subscriptionsError) throw new HttpError(503, 'No pudimos consultar los dispositivos.');
    if (!subscriptions?.length) return json({ sent: 0, no_devices: true });
    webpush.setVapidDetails('https://gana777.vercel.app', Deno.env.get('VAPID_PUBLIC_KEY') ?? '', Deno.env.get('VAPID_PRIVATE_KEY') ?? '');
    const url = notification.kind === 'chat_message' ? '/?view=chat'
      : notification.kind === 'withdrawal_paid' ? '/?view=profile' : '/?view=deposit';
    const payload = JSON.stringify({ title: notification.title, body: notification.body, url,
      tag: `gana777-${notification.id}` });
    let sent = 0;
    let failed = 0;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } }, payload, { TTL: 86400 });
        sent++;
      } catch (error) {
        const status = Number((error as { statusCode?: number }).statusCode);
        if (status === 404 || status === 410) await service.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        else failed++;
      }
    }
    if (sent > 0 && failed === 0) await service.from('user_notifications').update({ push_sent_at: new Date().toISOString() }).eq('id', notification.id);
    if (failed > 0) return json({ error: 'El aviso quedó guardado, pero algunos dispositivos no recibieron el push.', sent, failed }, 503);
    return json({ sent });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error('send-user-push failed', { type: error instanceof Error ? error.name : 'unknown' });
    return json({ error: 'No pudimos enviar la notificación push.' }, 500);
  }
});
