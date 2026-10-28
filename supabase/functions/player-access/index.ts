import { authenticate, cors, HttpError, json, serverClient } from '../_shared/http.ts';
import { canonicalFootprint } from '../_shared/footprint.ts';
import { requestIp } from '../_shared/ip.ts';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Solicitud no válida.');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new HttpError(400, `${label} no válido.`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new HttpError(400, `${label} no válido.`);
  return result;
}
function username(value: unknown): string {
  const result = text(value, 'Nombre de usuario', 3, 32).replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(result)) throw new HttpError(400, 'Usá de 3 a 32 caracteres: letras, números, punto, guion o guion bajo.');
  return result;
}
function password(value: unknown): string {
  const result = text(value, 'Contraseña', 8, 72);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/i.test(result)) {
    throw new HttpError(400, 'La contraseña contiene caracteres invisibles no permitidos.');
  }
  return result;
}
function id(value: unknown): string {
  const result = text(value, 'Solicitud', 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new HttpError(400, 'Solicitud no válida.');
  return result;
}
function bearerToken(value: unknown): string {
  const result = text(value, 'Acceso al chat', 32, 256);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new HttpError(401, 'No pudimos validar el acceso a esta conversación.');
  return result;
}
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function pepper(): string {
  return Deno.env.get('REGISTRATION_HASH_PEPPER') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'gana777-player-access-v1';
}
function casinoUrl(value: unknown): string {
  const raw = text(value, 'URL personal del casino', 10, 2048);
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new HttpError(400, 'Ingresá una URL personal válida.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new HttpError(400, 'La URL personal debe usar HTTPS y no incluir usuario ni contraseña en la dirección.');
  if (url.href.length > 2048) throw new HttpError(400, 'La URL personal es demasiado larga.');
  return url.href;
}
function optionalPhone(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = text(value, 'Teléfono', 8, 30);
  if (!/^[+0-9 ().-]+$/.test(raw)) throw new HttpError(400, 'Teléfono no válido.');
  const normalized = raw.replace(/\D/g, '');
  if (!/^[1-9][0-9]{7,14}$/.test(normalized)) throw new HttpError(400, 'Ingresá un teléfono con código de país, entre 8 y 15 números.');
  return normalized;
}
function optionalSlot(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 1 || slot > 50) throw new HttpError(400, 'Principal de WhatsApp no válido.');
  return slot;
}
async function platformProfile(server: ReturnType<typeof serverClient>, userId: string) {
  const { data, error } = await server.from('user_profiles')
    .select('user_id,username,display_name,phone,external_user_id,whatsapp_principal_slot,created_at,updated_at,account_origin')
    .eq('user_id', userId).eq('account_origin', 'platform').maybeSingle();
  if (error || !data) throw new HttpError(404, 'No encontramos ese usuario Platform.');
  return data;
}
async function requireStaff(request: Request) {
  const { db, user } = await authenticate(request);
  const { data: allowed, error } = await db.rpc('has_admin_permission', { permission_name: 'users' });
  if (error || !allowed) throw new HttpError(403, 'No tenés permiso para gestionar solicitudes de acceso.');
  return { user, server: serverClient() };
}
function missingIpColumn(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? '';
  return /ip_blocked|matched_username|matched_request_id|footprint_hash/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}
async function footprintDigest(value: unknown) {
  const canonical = canonicalFootprint(value);
  return canonical ? digest(`${pepper()}:footprint:${canonical}`) : null;
}
async function publicThread(server: ReturnType<typeof serverClient>, tokenValue: unknown) {
  const token = bearerToken(tokenValue);
  const tokenHash = await digest(`${pepper()}:${token}`);
  const flagged = await server.from('player_access_requests').select('id,username,referral_code,status,created_at,updated_at,ip_blocked').eq('access_token_hash', tokenHash).maybeSingle();
  if (flagged.error && missingIpColumn(flagged.error)) {
    const plain = await server.from('player_access_requests').select('id,username,referral_code,status,created_at,updated_at').eq('access_token_hash', tokenHash).maybeSingle();
    if (plain.error || !plain.data) throw new HttpError(404, 'No encontramos la solicitud. Revisá que estés en el mismo dispositivo donde la creaste.');
    return { ...plain.data, ip_blocked: false };
  }
  if (flagged.error) throw new HttpError(500, 'No pudimos cargar la solicitud.');
  if (!flagged.data) throw new HttpError(404, 'No encontramos la solicitud. Revisá que estés en el mismo dispositivo donde la creaste.');
  return { ...flagged.data, ip_blocked: false };
}
async function messagesFor(server: ReturnType<typeof serverClient>, requestId: string) {
  const { data, error } = await server.from('player_access_messages').select('id,sender,body,created_at').eq('request_id', requestId).order('created_at').order('id');
  if (error) throw new HttpError(500, 'No pudimos cargar los mensajes.');
  return data ?? [];
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    const body = await request.text();
    if (body.length > 12000) throw new HttpError(413, 'Solicitud demasiado grande.');
    const payload = record(JSON.parse(body));
    const action = payload.action;

    if (action === 'remember-footprint') {
      const { user } = await authenticate(request);
      const footprintHash = await footprintDigest(payload.footprint);
      if (!footprintHash) return json({ ok: true, saved: false });
      const server = serverClient();
      const current = await server.from('player_access_requests').select('id,footprint_hash').eq('player_user_id', user.id).eq('status', 'approved').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (current.error) {
        if (missingIpColumn(current.error)) return json({ ok: true, saved: false });
        throw new HttpError(500, 'No pudimos guardar la referencia del celular.');
      }
      if (!current.data || current.data.footprint_hash) return json({ ok: true, saved: false });
      const saved = await server.from('player_access_requests').update({ footprint_hash: footprintHash }).eq('id', current.data.id).is('footprint_hash', null);
      if (saved.error && !missingIpColumn(saved.error)) throw new HttpError(500, 'No pudimos guardar la referencia del celular.');
      return json({ ok: true, saved: !saved.error });
    }

    if (action === 'create') {
      // Honey-pot inputs return success without storing anything.
      if (typeof payload.website === 'string' && payload.website.trim()) return json({ ok: true });
      const server = serverClient();
      const playerUsername = username(payload.username);
      const token = bearerToken(payload.access_token);
      const device = bearerToken(payload.device_id);
      const originIp = requestIp(request.headers);
      const [tokenHash, deviceHash, ipHash] = await Promise.all([
        digest(`${pepper()}:${token}`), digest(`${pepper()}:device:${device}`),
        originIp ? digest(`${pepper()}:ip:${originIp}`) : Promise.resolve(null),
      ]);
      const originUserAgent = request.headers.get('user-agent')?.trim().slice(0, 512) || null;

      const { data: existingToken } = await server.from('player_access_requests').select('id,username,status').eq('access_token_hash', tokenHash).maybeSingle();
      if (existingToken) return json({ ok: true, request_id: existingToken.id, username: existingToken.username, status: existingToken.status, resumed: true });

      const { data: deviceRequests, error: deviceCheckError } = await server.from('player_access_requests')
        .select('id,username,status,player_user_id').eq('device_hash', deviceHash).in('status', ['pending', 'approved']).limit(100);
      if (deviceCheckError) throw new HttpError(500, 'No pudimos verificar este dispositivo.');
      const deviceAccount = (deviceRequests ?? []).find(row =>
        row.status === 'pending' || (row.status === 'approved' && Boolean(row.player_user_id))
      );
      if (deviceAccount) throw new HttpError(409, 'Este dispositivo ya tiene una solicitud o un usuario asociado. Contactá a soporte si necesitás ayuda.');

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error: deviceRateError } = await server.from('player_access_requests').select('id', { count: 'exact', head: true }).eq('device_hash', deviceHash).gte('created_at', since);
      if (deviceRateError) throw new HttpError(500, 'No pudimos verificar la solicitud.');
      if ((count ?? 0) >= 5) throw new HttpError(429, 'Ya se enviaron varias solicitudes desde este celular. Esperá 24 horas o escribinos por el canal de soporte.');
      const footprintHash = await footprintDigest(payload.footprint);

      const referralCode = typeof payload.referral_code === 'string' ? payload.referral_code.trim().replace(/^@/, '').toLowerCase() : '';
      if (referralCode.length > 32 || (referralCode && !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(referralCode))) throw new HttpError(400, 'El código recomendado no tiene un formato válido.');

      const { data: created, error } = await server.from('player_access_requests').insert({
        username: playerUsername, referral_code: referralCode || null,
        access_token_hash: tokenHash, device_hash: deviceHash, ip_hash: ipHash, footprint_hash: footprintHash,
        origin_ip: originIp, origin_user_agent: originUserAgent,
      }).select('id,username,status,created_at,updated_at').single();
      if (error?.code === '23505' && error.message.includes('player_access_requests_one_open_device')) {
        throw new HttpError(409, 'Este dispositivo ya tiene una solicitud abierta. Retomá la conversación guardada en este navegador.');
      }
      if (error || !created) throw new HttpError(500, 'No pudimos guardar la solicitud. Volvé a intentarlo más tarde.');
      const { error: messageError } = await server.from('player_access_messages').insert({ request_id: created.id, sender: 'player', body: `Solicito la creación del usuario @${playerUsername}.` });
      if (messageError) { await server.from('player_access_requests').delete().eq('id', created.id); throw new HttpError(500, 'No pudimos iniciar la conversación.'); }
      return json({ ok: true, request_id: created.id, username: created.username, status: created.status, resumed: false });
    }

    if (action === 'resume' || action === 'public-messages' || action === 'public-send') {
      const server = serverClient();
      const thread = await publicThread(server, payload.access_token);
      if (action === 'resume') return json({ ok: true, thread, messages: await messagesFor(server, thread.id) });
      if (action === 'public-messages') return json({ ok: true, thread, messages: await messagesFor(server, thread.id) });
      if (thread.status !== 'pending') throw new HttpError(409, 'La solicitud ya fue respondida y no admite nuevos mensajes.');
      const body = text(payload.body, 'Mensaje', 1, 2000);
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count, error: limitError } = await server.from('player_access_messages').select('id', { count: 'exact', head: true }).eq('request_id', thread.id).eq('sender', 'player').gte('created_at', since);
      if (limitError) throw new HttpError(500, 'No pudimos validar el envío.');
      if ((count ?? 0) >= 10) throw new HttpError(429, 'Esperá unos minutos antes de enviar más mensajes.');
      const { error } = await server.from('player_access_messages').insert({ request_id: thread.id, sender: 'player', body });
      if (error) throw new HttpError(500, 'No pudimos enviar el mensaje.');
      return json({ ok: true });
    }

    if (action === 'admin-count') {
      const { server } = await requireStaff(request);
      const { count, error } = await server.from('player_access_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      if (error) throw new HttpError(500, 'No pudimos contar las solicitudes pendientes.');
      return json({ ok: true, pending_count: count ?? 0 });
    }

    if (action === 'admin-list') {
      const { server } = await requireStaff(request);
      const flaggedInbox = await server.from('player_access_request_inbox').select('id,username,referral_code,status,player_user_id,created_at,updated_at,last_sender,last_body,last_message_at,ip_blocked,matched_username').order('created_at', { ascending: false }).limit(200);
      const listed = flaggedInbox.error && missingIpColumn(flaggedInbox.error)
        ? await server.from('player_access_request_inbox').select('id,username,referral_code,status,player_user_id,created_at,updated_at,last_sender,last_body,last_message_at').order('created_at', { ascending: false }).limit(200)
        : flaggedInbox;
      if (listed.error) throw new HttpError(500, 'No pudimos cargar las solicitudes. Aplicá la migración 031.');
      const data = listed.data ?? [];
      const requestIds = data.map(row => row.id);
      const { data: requestIps, error: requestIpsError } = requestIds.length
        ? await server.from('player_access_requests').select('id,ip_hash').in('id', requestIds)
        : { data: [], error: null };
      if (requestIpsError) throw new HttpError(500, 'No pudimos revisar las coincidencias de red.');
      const activeIpHashes = [...new Set((requestIps ?? []).flatMap(row => row.ip_hash ? [row.ip_hash] : []))];
      const { data: ipPeers, error: ipPeersError } = activeIpHashes.length
        ? await server.from('player_access_requests').select('id,username,status,ip_hash').in('ip_hash', activeIpHashes).in('status', ['pending', 'approved']).limit(2000)
        : { data: [], error: null };
      if (ipPeersError) throw new HttpError(500, 'No pudimos revisar las coincidencias de red.');
      const ipPeersByHash = new Map<string, string[]>();
      for (const peer of ipPeers ?? []) {
        if (!peer.ip_hash || !peer.username) continue;
        const peers = ipPeersByHash.get(peer.ip_hash) ?? [];
        peers.push(peer.username);
        ipPeersByHash.set(peer.ip_hash, peers);
      }
      const ipHashByRequest = new Map((requestIps ?? []).map(row => [row.id, row.ip_hash]));
      const approvedIds = (data ?? []).flatMap(row => row.status === 'approved' && row.player_user_id ? [row.player_user_id] : []);
      const { data: links, error: linksError } = approvedIds.length
        ? await server.from('player_casino_links').select('user_id').in('user_id', approvedIds)
        : { data: [], error: null };
      if (linksError) throw new HttpError(500, 'No pudimos verificar los enlaces personales. Aplicá la migración 032.');
      const linkedIds = new Set((links ?? []).map(link => link.user_id));
      return json({ ok: true, requests: data.map(row => ({
        id: row.id, username: row.username, referral_code: row.referral_code, status: row.status,
        player_user_id: row.player_user_id, created_at: row.created_at, updated_at: row.updated_at,
        has_personal_url: Boolean(row.player_user_id && linkedIds.has(row.player_user_id)),
        same_ip_usernames: (ipPeersByHash.get(ipHashByRequest.get(row.id) ?? '') ?? []).filter(name => name !== row.username),
        ip_blocked: Boolean('ip_blocked' in row && row.ip_blocked),
        matched_username: 'matched_username' in row && typeof row.matched_username === 'string' ? row.matched_username : null,
        latest_message: row.last_sender ? { sender: row.last_sender, body: typeof row.last_body === 'string' && /Contraseña(?: temporal)?:/.test(row.last_body) ? 'Credenciales enviadas' : row.last_body, created_at: row.last_message_at } : null,
      })) });
    }

    if (action === 'admin-messages') {
      const { server } = await requireStaff(request);
      const requestId = id(payload.request_id);
      const { data: thread, error } = await server.from('player_access_requests').select('id,username,referral_code,status,player_user_id,created_at,updated_at').eq('id', requestId).maybeSingle();
      if (error || !thread) throw new HttpError(404, 'La solicitud ya no existe.');
      const { data: personalLink, error: linkError } = thread.player_user_id
        ? await server.from('player_casino_links').select('url').eq('user_id', thread.player_user_id).maybeSingle()
        : { data: null, error: null };
      if (linkError) throw new HttpError(500, 'No pudimos cargar el enlace personal.');
      return json({ ok: true, thread, casino_url: personalLink?.url ?? null, messages: await messagesFor(server, requestId) });
    }

    if (action === 'admin-send') {
      const { server } = await requireStaff(request);
      const requestId = id(payload.request_id);
      const body = text(payload.body, 'Mensaje', 1, 2000);
      const { data: thread } = await server.from('player_access_requests').select('status').eq('id', requestId).maybeSingle();
      if (!thread) throw new HttpError(404, 'La solicitud ya no existe.');
      if (thread.status !== 'pending') throw new HttpError(409, 'La solicitud ya está cerrada.');
      const { error } = await server.from('player_access_messages').insert({ request_id: requestId, sender: 'admin', body });
      if (error) throw new HttpError(500, 'No pudimos enviar la respuesta.');
      return json({ ok: true });
    }

    if (action === 'admin-close') {
      const { server } = await requireStaff(request);
      const requestId = id(payload.request_id);
      const { data, error } = await server.from('player_access_requests').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', requestId).eq('status', 'pending').select('id').maybeSingle();
      if (error || !data) throw new HttpError(409, 'No pudimos cerrar la solicitud. Actualizá la bandeja.');
      const closing = 'Por ahora no pudimos aprobar esta solicitud. Si necesitás ayuda, respondé por los canales de contacto disponibles.';
      const { error: messageError } = await server.from('player_access_messages').insert({ request_id: requestId, sender: 'admin', body: closing });
      if (messageError) throw new HttpError(500, 'La solicitud se cerró, pero no se pudo enviar el aviso.');
      return json({ ok: true });
    }

    if (action === 'admin-approve') {
      const { server, user } = await requireStaff(request);
      const requestId = id(payload.request_id);
      const { data: accessRequest, error: requestError } = await server.from('player_access_requests').select('id,username,referral_code,referrer_user_id,status,device_hash').eq('id', requestId).maybeSingle();
      if (requestError || !accessRequest) throw new HttpError(404, 'La solicitud ya no existe.');
      if (accessRequest.status !== 'pending') throw new HttpError(409, 'La solicitud ya fue procesada.');
      const { data: existingDeviceAccount, error: deviceAccountError } = await server.from('player_access_requests')
        .select('id').eq('device_hash', accessRequest.device_hash).eq('status', 'approved')
        .not('player_user_id', 'is', null).neq('id', requestId).limit(1).maybeSingle();
      if (deviceAccountError) throw new HttpError(500, 'No pudimos verificar si este dispositivo ya tiene un usuario.');
      if (existingDeviceAccount) throw new HttpError(409, 'Este dispositivo ya tiene un usuario asociado.');
      const playerUsername = username(typeof payload.username === 'string' ? payload.username : accessRequest.username);
      const playerPassword = password(payload.password);
      const playerCasinoUrl = casinoUrl(payload.casino_url);
      const { data: existing } = await server.from('user_profiles').select('user_id').ilike('username', playerUsername).maybeSingle();
      if (existing) throw new HttpError(409, 'Ese nombre se registró mientras la solicitud esperaba. Cambiá el usuario en el directorio o respondé al solicitante para que elija otro.');
      const { data: usedLink, error: linkError } = await server.from('player_casino_links').select('user_id').eq('url', playerCasinoUrl).maybeSingle();
      if (linkError) throw new HttpError(500, 'No pudimos comprobar el enlace personal. Aplicá la migración 032.');
      if (usedLink) throw new HttpError(409, 'Esa URL personal ya está asignada a otro jugador.');
      let referrerId: string | null = accessRequest.referrer_user_id;
      if (accessRequest.referral_code && !referrerId) {
        const { data: referrer } = await server.from('user_profiles').select('user_id').ilike('username', accessRequest.referral_code).maybeSingle();
        if (!referrer) throw new HttpError(409, 'El código de recomendado no coincide con un jugador. Respondé por el chat para corregirlo antes de aprobar.');
        const { data: staff } = await server.from('admin_users').select('user_id').eq('user_id', referrer.user_id).maybeSingle();
        if (staff) throw new HttpError(409, 'El código pertenece a una cuenta del panel, no a un jugador. Respondé por el chat para corregirlo antes de aprobar.');
        referrerId = referrer.user_id;
      }

      const { data: renamed, error: renameError } = await server.from('player_access_requests')
        .update({ username: playerUsername, updated_at: new Date().toISOString() })
        .eq('id', requestId).eq('status', 'pending').select('id').maybeSingle();
      if (renameError?.code === '23505') throw new HttpError(409, 'Ese usuario ya está solicitado por otra persona. Elegí otro nombre.');
      if (renameError || !renamed) throw new HttpError(409, 'No pudimos actualizar el usuario solicitado. Actualizá la bandeja y volvé a intentar.');

      const email = `${playerUsername}@players.gana777.internal`;
      const { data: created, error: createError } = await server.auth.admin.createUser({
        email, password: playerPassword, email_confirm: true,
        user_metadata: { display_name: playerUsername, username: playerUsername, player: true },
      });
      if (createError || !created.user) {
        if (/already|registered|exists/i.test(createError?.message ?? '')) throw new HttpError(409, 'Ese nombre ya está registrado.');
        throw new HttpError(500, 'No pudimos crear el usuario.');
      }
      const { error: profileError } = await server.from('user_profiles').update({ username: playerUsername, display_name: playerUsername, account_origin: 'platform', updated_at: new Date().toISOString() }).eq('user_id', created.user.id);
      if (profileError) { await server.auth.admin.deleteUser(created.user.id); throw new HttpError(500, 'No pudimos guardar el perfil.'); }

      const { error: finalizeError } = await server.rpc('finalize_player_access_request', {
        p_request_id: requestId, p_user_id: created.user.id, p_admin_id: user.id,
        p_referrer_id: referrerId, p_password: playerPassword, p_casino_url: playerCasinoUrl,
      });
      if (finalizeError) {
        const { data: finalized } = await server.from('player_access_requests').select('status,player_user_id').eq('id', requestId).maybeSingle();
        if (finalized?.status === 'approved' && finalized.player_user_id === created.user.id) return json({ ok: true });
        await server.auth.admin.deleteUser(created.user.id);
        if (finalizeError.code === '40001') throw new HttpError(409, 'La solicitud cambió mientras se procesaba. Actualizá la bandeja antes de reintentar.');
        if (finalizeError.code === '23505' && finalizeError.message.includes('player_access_requests_one_approved_device')) throw new HttpError(409, 'Este dispositivo ya tiene un usuario asociado.');
        if (finalizeError.code === '23505') throw new HttpError(409, 'La URL personal ya se asignó a otro jugador.');
        throw new HttpError(500, 'No pudimos completar el acceso, el enlace o enviar las credenciales. No se creó la cuenta.');
      }
      return json({ ok: true });
    }

    if (action === 'admin-configure') {
      const { user, server } = await requireStaff(request);
      const requestId = id(payload.request_id);
      const playerPassword = password(payload.password);
      const playerCasinoUrl = casinoUrl(payload.casino_url);
      const { data: accessRequest, error: requestError } = await server.from('player_access_requests').select('id,status,player_user_id').eq('id', requestId).maybeSingle();
      if (requestError || !accessRequest) throw new HttpError(404, 'La solicitud ya no existe.');
      if (accessRequest.status !== 'approved' || !accessRequest.player_user_id) throw new HttpError(409, 'Esta solicitud todavía no tiene una cuenta creada.');
      const { data: usedLink, error: linkError } = await server.from('player_casino_links').select('user_id').eq('url', playerCasinoUrl).maybeSingle();
      if (linkError) throw new HttpError(500, 'No pudimos comprobar el enlace personal.');
      if (usedLink && usedLink.user_id !== accessRequest.player_user_id) throw new HttpError(409, 'Esa URL personal ya está asignada a otro jugador.');
      const { error: passwordError } = await server.auth.admin.updateUserById(accessRequest.player_user_id, { password: playerPassword });
      if (passwordError) throw new HttpError(500, 'No pudimos actualizar la contraseña del jugador.');
      const { error: configureError } = await server.rpc('configure_player_access_request', {
        p_request_id: requestId, p_admin_id: user.id, p_password: playerPassword, p_casino_url: playerCasinoUrl,
      });
      if (configureError) {
        if (configureError.code === '23505') throw new HttpError(409, 'La contraseña cambió, pero esa URL ya se asignó a otro jugador. Elegí otra URL y volvé a guardar con la misma contraseña.');
        throw new HttpError(500, 'La contraseña cambió, pero no se guardó el enlace ni el aviso. Reintentá con la misma contraseña.');
      }
      return json({ ok: true });
    }

    if (action === 'admin-platform-detail') {
      const { server } = await requireStaff(request);
      const userId = id(payload.user_id);
      const profile = await platformProfile(server, userId);
      const [authResult, accessResult, linkResult, referralResult, statsResult, operationsResult] = await Promise.all([
        server.auth.admin.getUserById(userId),
        server.from('player_access_requests').select('id,username,referral_code,status,created_at,origin_ip,origin_user_agent,ip_hash,device_hash').eq('player_user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        server.from('player_casino_links').select('url,updated_at').eq('user_id', userId).maybeSingle(),
        server.from('player_referrals').select('referrer_user_id,created_at').eq('referred_user_id', userId).maybeSingle(),
        server.rpc('platform_player_stats', { p_user_id: userId }),
        server.from('requests').select('id,kind,status,amount,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      ]);
      if (authResult.error || !authResult.data.user || accessResult.error || linkResult.error || referralResult.error || statsResult.error || operationsResult.error) {
        throw new HttpError(500, 'No pudimos cargar la ficha Platform. Revisá la migración 035.');
      }
      const referrerId = referralResult.data?.referrer_user_id;
      const { data: referrer } = referrerId
        ? await server.from('user_profiles').select('username,display_name').eq('user_id', referrerId).maybeSingle()
        : { data: null };
      const { data: principal } = profile.whatsapp_principal_slot
        ? await server.from('whatsapp_principals').select('phone,active').eq('slot', profile.whatsapp_principal_slot).maybeSingle()
        : { data: null };
      const authUser = authResult.data.user;
      const accessRow = accessResult.data;
      const accessRequest = accessRow ? {
        id: accessRow.id, username: accessRow.username, referral_code: accessRow.referral_code, status: accessRow.status,
        created_at: accessRow.created_at, origin_ip: accessRow.origin_ip, origin_user_agent: accessRow.origin_user_agent,
      } : null;
      let sameIpAccounts: { username: string }[] = [];
      let ipAttempts: { id: string; username: string; created_at: string }[] = [];
      if (accessRow?.ip_hash) {
        const { data: others } = await server.from('player_access_requests').select('username,player_user_id').eq('ip_hash', accessRow.ip_hash).eq('status', 'approved').not('player_user_id', 'is', null).neq('player_user_id', userId).limit(10);
        const seen = new Set<string>();
        for (const row of others ?? []) {
          if (!row.username || seen.has(row.username)) continue;
          seen.add(row.username);
          sameIpAccounts.push({ username: row.username });
        }
      }
      if (accessRow && 'device_hash' in accessRow && typeof accessRow.device_hash === 'string') {
        const attempts = await server.from('player_access_requests').select('id,username,created_at').eq('device_hash', accessRow.device_hash).eq('ip_blocked', true).order('created_at', { ascending: false }).limit(10);
        if (!attempts.error) ipAttempts = (attempts.data ?? []).flatMap(row => row.username ? [{ id: row.id, username: row.username, created_at: row.created_at }] : []);
      }
      return json({ ok: true, profile, access_request: accessRequest, casino_link: linkResult.data,
        referrer: referrerId ? { user_id: referrerId, name: referrer?.username || referrer?.display_name || 'Jugador registrado' } : null,
        principal: principal ?? null,
        auth: { last_sign_in_at: authUser.last_sign_in_at ?? null, banned_until: authUser.banned_until ?? null },
        stats: statsResult.data, operations: operationsResult.data ?? [],
        same_ip_accounts: sameIpAccounts, ip_attempts: ipAttempts,
      });
    }

    if (action === 'admin-platform-update') {
      const { server } = await requireStaff(request);
      const userId = id(payload.user_id);
      await platformProfile(server, userId);
      const displayName = text(payload.display_name, 'Nombre visible', 1, 80);
      const playerPhone = optionalPhone(payload.phone);
      const externalId = payload.external_user_id === null || payload.external_user_id === undefined || payload.external_user_id === ''
        ? null : text(payload.external_user_id, 'ID de plataforma', 1, 80);
      const principalSlot = optionalSlot(payload.whatsapp_principal_slot);
      if (principalSlot) {
        const { data: principal } = await server.from('whatsapp_principals').select('slot').eq('slot', principalSlot).eq('active', true).maybeSingle();
        if (!principal) throw new HttpError(400, 'Seleccioná un principal de WhatsApp activo.');
      }
      const { error } = await server.from('user_profiles').update({
        display_name: displayName, phone: playerPhone, external_user_id: externalId,
        whatsapp_principal_slot: principalSlot, updated_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('account_origin', 'platform');
      if (error?.code === '23505') throw new HttpError(409, 'El teléfono o ID de plataforma ya pertenece a otro usuario.');
      if (error) throw new HttpError(500, 'No pudimos guardar los datos del usuario.');
      return json({ ok: true });
    }

    if (action === 'admin-platform-link') {
      const { server } = await requireStaff(request);
      const userId = id(payload.user_id);
      await platformProfile(server, userId);
      const url = casinoUrl(payload.casino_url);
      const { error } = await server.from('player_casino_links').upsert({ user_id: userId, url, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error?.code === '23505') throw new HttpError(409, 'Esa URL ya pertenece a otro usuario.');
      if (error) throw new HttpError(500, 'No pudimos guardar el enlace personal.');
      return json({ ok: true });
    }

    if (action === 'admin-platform-ban') {
      const { server } = await requireStaff(request);
      const userId = id(payload.user_id);
      await platformProfile(server, userId);
      if (typeof payload.suspend !== 'boolean') throw new HttpError(400, 'Estado de suspensión no válido.');
      const { error } = await server.auth.admin.updateUserById(userId, { ban_duration: payload.suspend ? '876000h' : 'none' });
      if (error) throw new HttpError(500, payload.suspend ? 'No pudimos suspender el acceso.' : 'No pudimos reactivar el acceso.');
      return json({ ok: true });
    }

    throw new HttpError(400, 'Acción no válida.');
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: 'Solicitud no válida.' }, 400);
    return json({ error: 'No pudimos completar la operación.' }, 500);
  }
});
