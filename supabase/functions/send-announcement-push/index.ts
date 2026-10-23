import webpush from 'npm:web-push@3.6.7';
import { cors, HttpError, json, serverClient } from '../_shared/http.ts';

type Announcement = { id: string; user_id: string; title: string; body: string };
type Device = { endpoint: string; p256dh: string; auth_secret: string };

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    const service = serverClient();
    const { data: authorized, error: authError } = await service.rpc('verify_announcement_job_key', {
      p_key: request.headers.get('apikey') ?? '',
    });
    if (authError || !authorized) throw new HttpError(401, 'No autorizado.');
    const { data, error } = await service.rpc('claim_announcement_push_batch', { p_limit: 25 });
    if (error) throw new HttpError(503, 'No pudimos consultar los avisos programados.');
    const announcements = (data ?? []) as Announcement[];
    if (!announcements.length) return json({ processed: 0, sent: 0 });
    webpush.setVapidDetails('https://gana777.vercel.app', Deno.env.get('VAPID_PUBLIC_KEY') ?? '', Deno.env.get('VAPID_PRIVATE_KEY') ?? '');
    let sent = 0;
    for (const announcement of announcements) {
      const { data: devices, error: devicesError } = await service.from('push_subscriptions')
        .select('endpoint,p256dh,auth_secret').eq('user_id', announcement.user_id);
      if (devicesError) {
        await service.from('user_notifications').update({ push_claimed_at: null }).eq('id', announcement.id);
        continue;
      }
      let failed = false;
      const payload = JSON.stringify({ title: announcement.title, body: announcement.body,
        url: '/?view=home', tag: `gana777-${announcement.id}` });
      for (const device of (devices ?? []) as Device[]) {
        try {
          await webpush.sendNotification({ endpoint: device.endpoint,
            keys: { p256dh: device.p256dh, auth: device.auth_secret } }, payload, { TTL: 86400 });
          sent++;
        } catch (cause) {
          const status = Number((cause as { statusCode?: number }).statusCode);
          if (status === 404 || status === 410) await service.from('push_subscriptions').delete().eq('endpoint', device.endpoint);
          else failed = true;
        }
      }
      await service.from('user_notifications').update({
        push_claimed_at: null,
        push_sent_at: failed ? null : new Date().toISOString(),
      }).eq('id', announcement.id);
    }
    return json({ processed: announcements.length, sent });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error('send-announcement-push failed', { type: error instanceof Error ? error.name : 'unknown' });
    return json({ error: 'No pudimos enviar los avisos programados.' }, 500);
  }
});
