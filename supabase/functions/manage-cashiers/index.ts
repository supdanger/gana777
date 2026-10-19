import { authenticate, cors, HttpError, json, serverClient } from '../_shared/http.ts';

const permissionNames = ['home','deposit','withdrawal','history','users','contacts','bonuses','accounts','shifts','chat'] as const;
type PermissionName = typeof permissionNames[number];

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
function uuid(value: unknown): string {
  const result = text(value, 'Cajero', 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new HttpError(400, 'Cajero no válido.');
  return result;
}
function permissions(value: unknown): Record<PermissionName, boolean> {
  const source = record(value);
  return Object.fromEntries(permissionNames.map(name => [name, source[name] === true])) as Record<PermissionName, boolean>;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    if (Number(request.headers.get('Content-Length') ?? 0) > 16384) throw new HttpError(413, 'Solicitud demasiado grande.');
    const { db, user } = await authenticate(request);
    const { data: allowed, error: roleError } = await db.rpc('is_super_admin');
    if (roleError || !allowed) throw new HttpError(403, 'Solo el superadministrador puede gestionar cajeros.');
    const payload = record(await request.json());
    const action = payload.action;
    const server = serverClient();

    if (action === 'create') {
      const username = text(payload.username, 'Usuario', 3, 32).toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new HttpError(400, 'El usuario contiene caracteres no permitidos.');
      const displayName = text(payload.display_name ?? username, 'Nombre', 1, 80);
      const password = text(payload.password, 'Contraseña', 8, 72);
      const access = permissions(payload.permissions);
      const email = `${username}@staff.gana777.internal`;
      const { data: created, error: createError } = await server.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { display_name: displayName, username, staff: true },
      });
      if (createError || !created.user) {
        if (/already|registered|exists/i.test(createError?.message ?? '')) throw new HttpError(409, 'Ese nombre de usuario ya existe.');
        throw new HttpError(400, 'No se pudo crear el cajero. Revisá el usuario y la contraseña.');
      }
      const id = created.user.id;
      const { error: saveError } = await server.from('admin_users').insert({ user_id: id, is_super_admin: false });
      const { error: profileError } = saveError ? { error: saveError } : await server.from('cashier_profiles').insert({ user_id: id, username, display_name: displayName });
      const { error: permissionError } = saveError || profileError ? { error: saveError ?? profileError } : await server.from('admin_permissions').insert({ user_id: id, ...access });
      if (saveError || profileError || permissionError) {
        await server.auth.admin.deleteUser(id);
        if (/duplicate|unique/i.test((saveError ?? profileError ?? permissionError)?.message ?? '')) throw new HttpError(409, 'Ese nombre de usuario ya existe.');
        throw new HttpError(500, 'No se pudo guardar el cajero.');
      }
      return json({ user_id: id });
    }

    if (action === 'password') {
      const userId = uuid(payload.user_id);
      const password = text(payload.password, 'Contraseña', 8, 72);
      if (userId === user.id) throw new HttpError(400, 'Cambiá tu propia contraseña desde la configuración de tu cuenta.');
      const { data: target } = await server.from('cashier_profiles').select('user_id').eq('user_id', userId).maybeSingle();
      if (!target) throw new HttpError(404, 'El cajero ya no existe.');
      const { error } = await server.auth.admin.updateUserById(userId, { password });
      if (error) throw new HttpError(400, 'No se pudo cambiar la contraseña.');
      return json({ ok: true });
    }

    if (action === 'delete') {
      const userId = uuid(payload.user_id);
      if (userId === user.id) throw new HttpError(400, 'No podés eliminar tu propia cuenta.');
      const { data: target } = await server.from('cashier_profiles').select('user_id').eq('user_id', userId).maybeSingle();
      if (!target) throw new HttpError(404, 'El cajero ya no existe.');
      const { data: files } = await server.storage.from('cashier-avatars').list(userId, { limit: 20 });
      if (files?.length) await server.storage.from('cashier-avatars').remove(files.map(file => `${userId}/${file.name}`));
      const { error } = await server.auth.admin.deleteUser(userId);
      if (error) throw new HttpError(500, 'No se pudo eliminar el cajero.');
      return json({ ok: true });
    }

    throw new HttpError(400, 'Acción no válida.');
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: 'Solicitud no válida.' }, 400);
    return json({ error: 'No pudimos completar la operación.' }, 500);
  }
});
