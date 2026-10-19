import { useEffect, useRef, useState } from 'react';

type TurnstileApi = {
  ready(callback: () => void): void;
  render(container: HTMLElement, options: {
    sitekey: string; theme: 'dark'; size: 'compact'; language: 'es'; action: 'login';
    'response-field': false; callback: (token: string) => void;
    'expired-callback': () => void; 'error-callback': () => void;
  }): string;
  remove(id: string): void;
};
declare global { interface Window { turnstile?: TurnstileApi } }
let pending: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return new Promise(resolve => window.turnstile!.ready(() => resolve(window.turnstile!)));
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    const timeout = window.setTimeout(fail, 20000);
    function fail() {
      window.clearTimeout(timeout); script.onload = null; script.onerror = null;
      script.remove(); pending = null; reject(new Error('No se pudo cargar la verificación.'));
    }
    script.onerror = fail;
    script.onload = () => {
      if (!window.turnstile) { fail(); return; }
      window.turnstile.ready(() => { window.clearTimeout(timeout); resolve(window.turnstile!); });
    };
    document.head.appendChild(script);
  });
  return pending;
}
export function Turnstile({ siteKey, resetKey, onToken }: { siteKey: string; resetKey: number; onToken: (token: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!siteKey || !container.current) return;
    let alive = true;
    let id: string | null = null;
    let api: TurnstileApi | null = null;
    setFailed(false); onToken(null);
    void loadTurnstile().then(player => {
      if (!alive || !container.current) return;
      api = player;
      id = player.render(container.current, {
        sitekey: siteKey, theme: 'dark', size: 'compact', language: 'es', action: 'login', 'response-field': false,
        callback: token => { if (alive) { setFailed(false); onToken(token); } },
        'expired-callback': () => { if (alive) onToken(null); },
        'error-callback': () => { if (alive) { onToken(null); setFailed(true); } },
      });
    }).catch(() => { if (alive) { onToken(null); setFailed(true); } });
    return () => { alive = false; if (id !== null) api?.remove(id); };
  }, [siteKey, resetKey, attempt, onToken]);
  return <div className="login-verification"><div ref={container} />{failed && <div role="alert"><p>No se pudo completar la verificación de seguridad.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Reintentar verificación</button></div>}</div>;
}
