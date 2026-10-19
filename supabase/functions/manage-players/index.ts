import { authenticate, cors, HttpError, json, serverClient } from '../_shared/http.ts';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Solicitud no válida.');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new HttpError(400, `${name} no válido.`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new HttpError(400, `${name} no válido.`);
  return result;
}
function optionalText(value: unknown, name: string, max: number): string | null {
  if (value === null || value === undefined || value === '') return null;
  return text(value, name, 1, max);
}
function uuid(value: unknown): string {
  const result = text(value, 'Jugador', 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new HttpError(400, 'Jugador no válido.');
  return result;
}
function username(value: unknown): string {
  const result = text(value, 'Usuario', 3, 32).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(result)) throw new HttpError(400, 'El usuario debe usar letras, números, punto, guion o guion bajo.');
  return result;
}
function phone(value: unknown): string {
  const original = text(value, 'Teléfono', 8, 30);
  if (!/^[+0-9 ().-]+$/.test(original)) throw new HttpError(400, 'El teléfono contiene caracteres no permitidos.');
  const normalized = original.replace(/\D/g, '');
  if (!/^[1-9][0-9]{7,14}$/.test(normalized)) throw new HttpError(400, 'Ingresá el teléfono con código de país, entre 8 y 15 números.');
  return normalized;
}
function slot(value: unknown): number {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 50) throw new HttpError(400, 'Principal de WhatsApp no válido.');
  return result;
}
function profileError(error: { message?: string; code?: string } | null): HttpError {
  const message = error?.message ?? '';
  if (/phone|player_phone_unique/i.test(message)) return new HttpError(409, 'Ese número de teléfono ya pertenece a otro jugador.');
  if (/username|player_username_unique/i.test(message)) return new HttpError(409, 'Ese nombre de usuario ya existe.');
  if (/external_user_id|player_external_id_unique/i.test(message)) return new HttpError(409, 'Ese ID de la plataforma ya pertenece a otro jugador.');
  if (/whatsapp_principal/i.test(message)) return new HttpError(400, 'El principal seleccionado ya no está disponible.');
  return new HttpError(400, 'No se pudieron guardar los datos del jugador.');
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    if (Number(request.headers.get('Content-Length') ?? 0) > 16384) throw new HttpError(413, 'Solicitud demasiado grande.');
    const { db, user } = await authenticate(request);
    const { data: allowed, error: permissionError } = await db.rpc('has_admin_permission', { permission_name: 'users' });
    if (permissionError || !allowed) throw new HttpError(403, 'No tenés permiso para gestionar jugadores.');
    const payload = record(await request.json());
    const action = payload.action;
    const server = serverClient();

    if (action === 'referral-capabilities') {
      const { error } = await server.from('player_referrals').select('referred_user_id').limit(0);
      if (error) throw new HttpError(400, 'Aplicá la migración 022 antes de crear recomendados.');
      return json({ ok: true, referrals: true });
    }

    if (action === 'create') {
      const playerUsername = username(payload.username);
      const playerPhone = phone(payload.phone);
      const password = text(payload.password, 'Contraseña', 8, 72);
      const principalSlot = slot(payload.whatsapp_principal_slot);
      const externalId = optionalText(payload.external_user_id, 'ID de la plataforma', 80);
      const referrerId = payload.referrer_user_id === null || payload.referrer_user_id === undefined || payload.referrer_user_id === '' ? null : uuid(payload.referrer_user_id);
      if (referrerId) {
        const [profile, staff] = await Promise.all([
          server.from('user_profiles').select('user_id').eq('user_id', referrerId).maybeSingle(),
          server.from('admin_users').select('user_id').eq('user_id', referrerId).maybeSingle(),
        ]);
        if (profile.error || staff.error) throw new HttpError(400, 'No pudimos verificar al recomendador.');
        if (!profile.data || staff.data) throw new HttpError(400, 'Seleccioná un jugador válido como recomendador.');
      }
      const { data: principal } = await server.from('whatsapp_principals').select('slot').eq('slot', principalSlot).eq('active', true).maybeSingle();
      if (!principal) throw new HttpError(400, 'Seleccioná un principal de WhatsApp activo.');
      const { data: existingPhone } = await server.from('user_profiles').select('user_id').eq('phone', playerPhone).maybeSingle();
      if (existingPhone) throw new HttpError(409, 'Ese número de teléfono ya pertenece a otro jugador.');
      const email = `${playerUsername}@players.gana777.internal`;
      const { data: created, error: createError } = await server.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { display_name: playerUsername, username: playerUsername, player: true },
      });
      if (createError || !created.user) {
        if (/already|registered|exists/i.test(createError?.message ?? '')) throw new HttpError(409, 'Ese nombre de usuario ya existe.');
        throw new HttpError(400, 'No se pudo crear el jugador. Revisá el usuario y la contraseña.');
      }
      const { error: saveError } = await server.from('user_profiles').update({
        username: playerUsername, display_name: playerUsername, phone: playerPhone,
        external_user_id: externalId, whatsapp_principal_slot: principalSlot, updated_at: new Date().toISOString(),
      }).eq('user_id', created.user.id);
      if (saveError) { await server.auth.admin.deleteUser(created.user.id); throw profileError(saveError); }
      if (referrerId) {
        const { error: referralError } = await server.from('player_referrals').insert({
          referred_user_id: created.user.id, referrer_user_id: referrerId, created_by: user.id,
        });
        if (referralError) {
          const { error: cleanupError } = await server.auth.admin.deleteUser(created.user.id);
          if (cleanupError) throw new HttpError(500, 'No se completó la recomendación. Revisá la cuenta creada antes de volver a intentar.');
          throw new HttpError(400, referralError.code === '22023' ? referralError.message : 'No se pudo registrar la recomendación. Aplicá la migración 022 antes de crear recomendados.');
        }
      }
      return json({ user_id: created.user.id, referral_registered: Boolean(referrerId) });
    }

    if (action === 'update') {
      const userId = uuid(payload.user_id);
      const playerPhone = phone(payload.phone);
      const principalSlot = slot(payload.whatsapp_principal_slot);
      const externalId = optionalText(payload.external_user_id, 'ID de la plataforma', 80);
      const { data: admin } = await server.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle();
      if (admin) throw new HttpError(400, 'La cuenta seleccionada pertenece al personal del panel.');
      const { data: target } = await server.from('user_profiles').select('user_id').eq('user_id', userId).maybeSingle();
      if (!target) throw new HttpError(404, 'El jugador ya no existe.');
      const { data: principal } = await server.from('whatsapp_principals').select('slot').eq('slot', principalSlot).eq('active', true).maybeSingle();
      if (!principal) throw new HttpError(400, 'Seleccioná un principal de WhatsApp activo.');
      const { error } = await server.from('user_profiles').update({
        phone: playerPhone, external_user_id: externalId, whatsapp_principal_slot: principalSlot, updated_at: new Date().toISOString(),
      }).eq('user_id', userId);
      if (error) throw profileError(error);
      return json({ ok: true });
    }

    if (action === 'password') {
      const userId = uuid(payload.user_id);
      const password = text(payload.password, 'Contraseña', 8, 72);
      const { data: admin } = await server.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle();
      if (admin) throw new HttpError(400, 'La cuenta seleccionada pertenece al personal del panel.');
      const { data: target } = await server.from('user_profiles').select('user_id').eq('user_id', userId).maybeSingle();
      if (!target) throw new HttpError(404, 'El jugador ya no existe.');
      const { error } = await server.auth.admin.updateUserById(userId, { password });
      if (error) throw new HttpError(400, 'No se pudo cambiar la contraseña.');
      return json({ ok: true });
    }

    throw new HttpError(400, 'Acción no válida.');
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: 'Solicitud no válida.' }, 400);
    return json({ error: 'No pudimos completar la operación.' }, 500);
  }
});
