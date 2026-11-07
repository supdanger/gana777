import { cors, HttpError, json, serverClient } from '../_shared/http.ts';
import { entryHash } from '../_shared/player-entry.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    if (Number(request.headers.get('Content-Length') ?? 0) > 1024) throw new HttpError(413, 'Solicitud demasiado grande.');
    const { token } = await request.json();
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(token)) throw new HttpError(410, 'Este enlace venció o fue reemplazado. Pedí uno nuevo.');
    const server = serverClient();
    const hash = await entryHash(token);
    const { data: userId, error } = await server.rpc('claim_player_entry', { p_hash: hash });
    if (error || !userId) {
      if (error?.message === 'entry_busy') throw new HttpError(429, 'El ingreso está en proceso. Esperá 15 segundos y reintentá.');
      if (error?.message === 'entry_expired') throw new HttpError(410, 'Este enlace venció o fue reemplazado. Pedí uno nuevo.');
      throw new HttpError(503, 'No pudimos iniciar el ingreso. Reintentá en unos segundos.');
    }
    const { data: user, error: lookupError } = await server.auth.admin.getUserById(userId);
    const email = user.user?.email;
    if (lookupError || !email?.endsWith('@players.gana777.internal')) throw new HttpError(410, 'Este enlace ya no está disponible. Pedí uno nuevo.');
    const { data: link, error: linkError } = await server.auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) throw new HttpError(503, 'No pudimos iniciar el ingreso. Reintentá en unos segundos.');
    // El canje cambia la sesión del cliente: mantenerlo separado del cliente de
    // servicio usado para la comprobación final de permisos y revocación.
    const { data: verified, error: verifyError } = await serverClient().auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
    if (verifyError || !verified.session || verified.user?.id !== userId) throw new HttpError(503, 'No pudimos completar el ingreso. Reintentá en unos segundos.');
    // Una renovación/revocación concurrente impide entregar esta sesión.
    const { data: active, error: activeError } = await server.from('player_entry_links').select('user_id')
      .eq('token_hash', hash).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (activeError || !active) throw new HttpError(410, 'Este enlace venció o fue reemplazado. Pedí uno nuevo.');
    return json({ access_token: verified.session.access_token, refresh_token: verified.session.refresh_token });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    return json({ error: 'No pudimos completar el ingreso. Reintentá en unos segundos.' }, 503);
  }
});
