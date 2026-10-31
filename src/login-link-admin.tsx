import { useState, type ClipboardEvent, type FormEvent } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { InputError } from '../supabase/functions/_shared/validation';
import { supabase } from './lib';
import { safeHttpsLink } from './security';

type CreatedLink = { username: string; password: string; actionLink: string; redirectTo: string };

const passwordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function newPassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => passwordAlphabet[byte % passwordAlphabet.length]).join('');
}

export function pastedCasinoUrl(value: string): string | null {
  const trimmed = value.trim();
  const direct = safeHttpsLink(trimmed);
  if (direct) return direct;
  const found = trimmed.match(/https:\/\/[^\s<>"'`\])]+/g) ?? [];
  for (const match of found) {
    const link = safeHttpsLink(match.replace(/[),.;]+$/g, ''));
    if (link) return link;
  }
  return null;
}

export function casinoUrlFieldValue(value: string): string {
  const link = pastedCasinoUrl(value);
  if (!link) return value;
  const trimmed = value.trim();
  if (trimmed === link || link.startsWith(trimmed)) return trimmed === value ? value : trimmed;
  return link;
}

export function playerLoginRedirect(location: Pick<Location, 'hostname' | 'port'> = window.location): string {
  const host = location.hostname;
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (!local) return 'https://gana777bet.online/';
  const userPort = location.port === '5174' ? '5173' : '5174';
  const hostname = host === '127.0.0.1' || host === '[::1]' ? host : 'localhost';
  return `http://${hostname}:${userPort}/`;
}

async function functionError(error: unknown, data: unknown, fallback: string): Promise<Error> {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return new InputError(data.error);
  if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    try {
      const body: unknown = await error.context.clone().json();
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return new InputError(body.error);
    } catch { /* Supabase may return a response without JSON. */ }
    if (error.context.status === 404) return new InputError('La función manage-players todavía no está desplegada en Supabase.');
    if (error.context.status === 403) return new InputError('No tenés permiso para gestionar jugadores.');
  }
  return new InputError(fallback);
}

export function LoginLinkAdmin({ demo, busy, action }: { demo: boolean; busy: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const [password, setPassword] = useState(newPassword);
  const [casinoUrl, setCasinoUrl] = useState('');
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const [renewed, setRenewed] = useState<{ username: string; actionLink: string } | null>(null);
  const [copied, setCopied] = useState<'password' | 'link' | 'renewed' | null>(null);
  const redirectTo = playerLoginRedirect();

  function onCasinoPaste(event: ClipboardEvent<HTMLInputElement>) {
    const link = pastedCasinoUrl(event.clipboardData.getData('text'));
    if (!link) return;
    event.preventDefault();
    setCasinoUrl(link);
  }

  async function copyValue(value: string, field: 'password' | 'link' | 'renewed') {
    await navigator.clipboard.writeText(value);
    setCopied(field);
    window.setTimeout(() => setCopied(current => current === field ? null : current), 2000);
  }

  async function createLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const nextPassword = password;
    const link = pastedCasinoUrl(String(form.get('casino_url') ?? ''));
    if (link) setCasinoUrl(link);
    await action(async () => {
      if (!link) throw new InputError('Pegá la URL personal completa, la que empieza con https://.');
      if (demo || !supabase) throw new InputError('La vista previa no crea enlaces.');
      const result = await supabase.functions.invoke('manage-players', {
        body: {
          action: 'login-link',
          username: form.get('username'),
          password: nextPassword,
          casino_url: link,
          redirect_to: redirectTo,
        },
      });
      if (result.error || typeof result.data?.action_link !== 'string' || typeof result.data?.username !== 'string') {
        throw await functionError(result.error, result.data, 'No se pudo crear el enlace.');
      }
      setCreated({ username: result.data.username, password: nextPassword, actionLink: result.data.action_link, redirectTo });
      setPassword(newPassword());
      setCasinoUrl('');
      element.reset();
    });
  }

  async function renewLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no crea enlaces.');
      const result = await supabase.functions.invoke('manage-players', {
        body: { action: 'login-link-again', username: form.get('username'), redirect_to: redirectTo },
      });
      if (result.error || typeof result.data?.action_link !== 'string' || typeof result.data?.username !== 'string') {
        throw await functionError(result.error, result.data, 'No se pudo crear el enlace.');
      }
      setRenewed({ username: result.data.username, actionLink: result.data.action_link });
      element.reset();
    });
  }

  return <section className="player-admin login-link-admin" aria-labelledby="login-link-title">
    <div className="account-heading"><div><h1 id="login-link-title">Link</h1><p>Creá el usuario con su enlace de casino y copiá un ingreso temporal. Quien lo abra entra directo a esa cuenta.</p></div></div>
    <form className="player-create" onSubmit={event => void createLink(event)}>
      <div className="player-create-fields">
        <label>Nombre de usuario<input name="username" minLength={3} maxLength={32} pattern={'[a-zA-Z0-9._\\-]+'} autoCapitalize="none" spellCheck={false} placeholder="juanito" required /></label>
        <label className="login-link-casino">URL personal del casino<input name="casino_url" type="text" inputMode="url" maxLength={8192} placeholder="https://gana777bet.com/?auth=…" spellCheck={false} value={casinoUrl} onChange={event => setCasinoUrl(casinoUrlFieldValue(event.target.value))} onPaste={onCasinoPaste} required /><small>El enlace personal abre «Ir al casino» solo para este jugador. Si pegás solo https://gana777bet.com, se puede usar en varios y el banner queda con el enlace general.</small></label>
      </div>
      <p className="login-link-note">El enlace de ingreso abre el portal en {redirectTo}. gana777bet.com solo se usa si el jugador toca «Ir al casino». Dura cerca de una hora, funciona una sola vez y hay que pasarlo en privado. La contraseña se muestra después, por si el enlace ya venció.</p>
      <button className="cashier-create-submit" disabled={busy}><Link2 size={16} aria-hidden="true" /> Crear usuario y generar enlace</button>
    </form>
    {created && <div className="player-create login-link-result">
      <p className="login-link-note">Listo, @{created.username}. Copiá el enlace y pasalo solo a esa persona.</p>
      <div className="login-link-row"><span>Contraseña</span><div><input readOnly value={created.password} aria-label="Contraseña del jugador" /><button type="button" onClick={() => void copyValue(created.password, 'password')}>{copied === 'password' ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}</button></div></div>
      <div className="login-link-row"><span>Enlace temporal</span><div><input readOnly value={created.actionLink} aria-label="Enlace temporal de ingreso" /><button type="button" onClick={() => void copyValue(created.actionLink, 'link')}>{copied === 'link' ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}</button></div></div>
    </div>}
    <form className="player-create login-link-renew" onSubmit={event => void renewLink(event)}>
      <div className="account-heading"><div><h2>Usuario ya creado</h2><p>Generá otro ingreso para una cuenta que ya existe. No crea otro usuario y no cambia la contraseña ni el enlace del casino.</p></div></div>
      <label>Nombre de usuario<input name="username" minLength={3} maxLength={32} pattern={'[a-zA-Z0-9._\\-]+'} autoCapitalize="none" spellCheck={false} placeholder="juanito" required /></label>
      <p className="login-link-note">El enlace abre el portal en {redirectTo}. Dura cerca de una hora, funciona una sola vez y hay que pasarlo en privado.</p>
      <button className="cashier-create-submit" disabled={busy}><Link2 size={16} aria-hidden="true" /> Generar enlace de nuevo</button>
      {renewed && <div className="login-link-result">
        <p className="login-link-note">Listo, @{renewed.username}. La contraseña sigue siendo la que ya tenía.</p>
        <div className="login-link-row"><span>Enlace temporal</span><div><input readOnly value={renewed.actionLink} aria-label="Enlace temporal para el usuario existente" /><button type="button" onClick={() => void copyValue(renewed.actionLink, 'renewed')}>{copied === 'renewed' ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}</button></div></div>
      </div>}
    </form>
  </section>;
}
