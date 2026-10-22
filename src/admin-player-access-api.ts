import { InputError } from '../supabase/functions/_shared/validation';
import { supabase } from './lib';

export class AccessSessionError extends InputError {
  constructor() { super('Tu sesión venció. Volvé a ingresar.'); this.name = 'AccessSessionError'; }
}

export async function invokeAdminPlayerAccess(body: Record<string, unknown>) {
  if (!supabase) throw new InputError('No hay conexión con Supabase.');

  const { data: current } = await supabase.auth.getSession();
  if (!current.session) throw new AccessSessionError();

  let token = current.session.access_token;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.functions.invoke('player-access', {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });
    const response = error && typeof error === 'object' && 'context' in error && error.context instanceof Response
      ? error.context : null;
    if (response?.status === 401) {
      if (attempt === 0) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed.session) { token = refreshed.session.access_token; continue; }
      }
      throw new AccessSessionError();
    }
    if (error || !data?.ok) {
      let message = data?.error;
      if (!message && response) {
        try { message = (await response.clone().json())?.error; } catch { /* Response without JSON. */ }
      }
      throw new InputError(typeof message === 'string' ? message : 'No pudimos comunicarnos con el servicio de solicitudes.');
    }
    return data;
  }
  throw new AccessSessionError();
}
