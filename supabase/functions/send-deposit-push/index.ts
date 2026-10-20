import webpush from 'npm:web-push@3.6.7';
import { authenticate, cors, HttpError, json, serverClient } from '../_shared/http.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    const { db } = await authenticate(request);
    const { data: permitted, error: permissionError } = await db.rpc('has_admin_permission', { permission_name: 'deposit' });
    if (permissionError || !permitted) throw new HttpError(403, 'No tenés permiso para enviar este aviso.');
    const input = await request.json();
    const notificationId = typeof input.notification_id === 'string' ? input.notification_id : null;
    const requestId = typeof input.request_id === 'string' ? input.request_id : null;
    if (!/^[0-9a-f-]{36}$/i.test(notificationId ?? requestId ?? '')) throw new HttpError(400, 'Aviso inválido.');
    const service = serverClient();
    const { data: notification, error: notificationError } = await service.from('user_notifications')
      .select('id,user_id,request_id,title,body,push_sent_at').eq(notificationId ? 'id' : 'request_id', notificationId ?? requestId).eq('kind', 'deposit_credited').single();
    if (notificationError || !notification) throw new HttpError(404, 'No encontramos el aviso.');
    if (notification.push_sent_at) return json({ sent: 0, already_sent: true });
    const { data: credit, error: creditError } = await service.from('deposit_credits')
      .select('request_id').eq('request_id', notification.request_id).eq('user_id', notification.user_id).maybeSingle();
    if (creditError || !credit) throw new HttpError(409, 'La acreditación no está confirmada.');
    const { data: subscriptions, error: subscriptionsError } = await service.from('push_subscriptions')
      .select('endpoint,p256dh,auth_secret').eq('user_id', notification.user_id);
    if (subscriptionsError) throw new HttpError(503, 'No pudimos consultar los dispositivos.');
    if (!subscriptions?.length) return json({ sent: 0, no_devices: true });
    webpush.setVapidDetails('https://gana777.vercel.app', Deno.env.get('VAPID_PUBLIC_KEY') ?? '', Deno.env.get('VAPID_PRIVATE_KEY') ?? '');
    const payload = JSON.stringify({ title: notification.title, body: notification.body, requestId: notification.request_id, url: '/' });
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
    console.error('send-deposit-push failed', { type: error instanceof Error ? error.name : 'unknown' });
    return json({ error: 'No pudimos enviar la notificación push.' }, 500);
  }
});
