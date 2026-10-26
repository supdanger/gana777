import { authenticate, cors, HttpError, json, serverClient } from '../_shared/http.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    const { db } = await authenticate(request);
    const { data: admin, error: permissionError } = await db.rpc('is_super_admin');
    if (permissionError || !admin) throw new HttpError(403, 'Solo el superadministrador puede probar estos avisos.');
    const input = await request.json().catch(() => null) as { route?: unknown } | null;
    const route = typeof input?.route === 'string' ? input.route : '';
    if (!/^(withdrawals|deposits_all|shifts|sac_[1-5])$/.test(route)) throw new HttpError(400, 'Grupo inválido.');
    const { data: destination, error } = await serverClient().from('telegram_routes')
      .select('chat_id').eq('route', route).maybeSingle();
    if (error || !destination?.chat_id) throw new HttpError(400, 'Guardá primero el identificador del grupo.');
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN')?.trim();
    if (!token) throw new HttpError(503, 'Falta configurar el token del bot en Supabase.');
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: destination.chat_id, text: `✅ Prueba de avisos internos GANA777 · ${route}` }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new HttpError(502, `Telegram rechazó el grupo (${response.status}). Revisá el ID y que el bot pertenezca al grupo.`);
    return json({ delivered: true });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error('test-telegram-route failed', { type: error instanceof Error ? error.name : 'unknown' });
    return json({ error: 'No pudimos enviar la prueba a Telegram.' }, 500);
  }
});
