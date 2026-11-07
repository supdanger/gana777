import { supabase } from './lib';
import { cachedResource } from './resource-cache';

// Share read-only RPCs across the home, bonus carousel and bonus picker. This
// cache is session-scoped and short-lived; mutations still go to the server.
export async function sharedPlayerRpc<T>(name: string, ttl = 5_000): Promise<{ data: T | null; error: { message: string } | null }> {
  if (!supabase) return { data: null, error: null };
  try {
    const { data: session, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!session.session) return { data: null, error: { message: 'Ingresá de nuevo para continuar.' } };
    const data = await cachedResource<T>(`player-rpc:${session.session.user.id}:${name}`, ttl, async () => {
      const result = await supabase!.rpc(name);
      if (result.error) throw result.error;
      return result.data as T;
    });
    return { data, error: null };
  } catch (cause) { return { data: null, error: { message: cause instanceof Error ? cause.message : 'No pudimos actualizar los datos.' } }; }
}
