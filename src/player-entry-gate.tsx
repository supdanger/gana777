import { useEffect, useRef, useState, type ReactNode } from 'react';
import { adminApp, supabase } from './lib';

// Capturar antes de inicializar pantallas: nunca mostrar otra cuenta o el login
// mientras se resuelve un enlace. El secreto solo permanece en memoria.
const initialEntry = !adminApp && window.location.hash.startsWith('#e=') ? window.location.hash.slice(3) : null;
if (initialEntry !== null) window.history.replaceState(null, '', window.location.pathname + window.location.search);

export function PlayerEntryGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(initialEntry === null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (initialEntry === null) return;
    let alive = true;
    setError('');
    if (!inFlight.current) inFlight.current = (async () => {
      if (!supabase) throw new Error('No pudimos conectar. Reintentá el ingreso.');
      const { data, error: requestError } = await supabase.functions.invoke('player-entry', { body: { token: initialEntry }, signal: AbortSignal.timeout(20_000) });
      if (requestError) {
        const response = 'context' in requestError && requestError.context instanceof Response ? requestError.context : null;
        if (response?.status === 410) {
          setExpired(true);
          throw new Error('Este enlace venció o fue reemplazado. Pedí uno nuevo a quien te lo envió.');
        }
        throw new Error(response?.status === 429 ? 'El ingreso está en proceso. Esperá 15 segundos y reintentá.' : 'No pudimos conectar con tu cuenta. Reintentá en unos segundos.');
      }
      if (!data?.access_token || !data?.refresh_token) throw new Error('No pudimos completar el ingreso. Reintentá.');
      const { error: sessionError } = await supabase.auth.setSession(data);
      if (sessionError) throw new Error('No pudimos guardar el ingreso. Reintentá.');
    })();
    void inFlight.current.then(() => { if (alive) setReady(true); }).catch(cause => {
      if (alive) setError(cause instanceof Error ? cause.message : 'No pudimos completar el ingreso.');
    });
    return () => { alive = false; };
  }, [attempt]);
  if (ready) return children;
  return <main className="entry-access-screen"><section aria-live="polite" aria-busy={!error}>
    <h1>{expired ? 'Pedí un enlace nuevo' : error ? 'Vamos a intentar de nuevo' : 'Entrando a tu cuenta…'}</h1>
    <p>{error || 'Estamos preparando tu acceso.'}</p>
    {error && !expired && <button type="button" onClick={() => { inFlight.current = null; setAttempt(value => value + 1); }}>Reintentar ingreso</button>}
  </section></main>;
}
