import { HttpError, serverClient } from './http.ts';

export async function entryHash(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createPlayerEntry(server: ReturnType<typeof serverClient>, userId: string, actor: string, redirect: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const { error } = await server.from('player_entry_links').upsert({ user_id: userId,
    token_hash: await entryHash(token), created_by: actor,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(), revoked_at: null, last_attempt_at: null });
  if (error) throw new HttpError(503, 'No se pudo preparar el acceso directo. Revisá que esté habilitada la migración 100.');
  return `${redirect}#e=${token}`;
}
