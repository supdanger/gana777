import { createClient } from 'npm:@supabase/supabase-js@2';
import { requiredEnv } from './cloudinary.ts';
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'HttpError'; }
}
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
export async function authenticate(request: Request, permission?: string) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Ingresá a tu cuenta para continuar.');
  const db = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.');
  const access = permission ? await db.rpc('authorize_staff_access', { p_permission: permission }) : await db.rpc('account_access_allowed');
  if (access.error?.message?.includes('ACCOUNT_BLOCKED') || (!permission && access.data === false)) throw new HttpError(403, 'ACCOUNT_BLOCKED: Tu acceso fue suspendido. Contactá a soporte.');
  if (access.error) throw new HttpError(503, 'No pudimos verificar el estado de tu cuenta. Intentá más tarde.');
  if (permission && !access.data) throw new HttpError(403, 'No tenés permiso para gestionar este apartado.');
  return { db, user: data.user };
}
export function serverClient() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}
