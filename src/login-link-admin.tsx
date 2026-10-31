import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { InputError } from '../supabase/functions/_shared/validation';
import { supabase } from './lib';

type Principal = { slot: number; phone: string; active: boolean };
type CreatedLink = { username: string; password: string; actionLink: string; redirectTo: string };

const passwordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function newPassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => passwordAlphabet[byte % passwordAlphabet.length]).join('');
}

export function playerLoginRedirect(location: Pick<Location, 'hostname' | 'port'> = window.location): string {
  const host = location.hostname;
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (!local) return 'https://gana777bet.com/';
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
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [loading, setLoading] = useState(!demo && !!supabase);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState(newPassword);
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const [copied, setCopied] = useState<'password' | 'link' | null>(null);
  const redirectTo = playerLoginRedirect();

  useEffect(() => {
    if (demo || !supabase) {
      setPrincipals(demo ? [{ slot: 1, phone: '595900000000', active: true }] : []);
      setLoading(false);
      return;
    }
    let alive = true;
    void supabase.from('whatsapp_principals').select('slot,phone,active').order('slot').then(({ data, error }) => {
      if (!alive) return;
      setLoading(false);
      if (error) { setLoadError('No pudimos cargar los principales. Revisá Contactos.'); return; }
      setLoadError('');
      setPrincipals((data ?? []) as Principal[]);
    });
    return () => { alive = false; };
  }, [demo]);

  async function copyValue(value: string, field: 'password' | 'link') {
    await navigator.clipboard.writeText(value);
    setCopied(field);
    window.setTimeout(() => setCopied(current => current === field ? null : current), 2000);
  }

  async function createLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const nextPassword = password;
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no crea enlaces.');
      const result = await supabase.functions.invoke('manage-players', {
        body: {
          action: 'login-link',
          username: form.get('username'),
          password: nextPassword,
          phone: form.get('phone'),
          whatsapp_principal_slot: form.get('whatsapp_principal_slot'),
          redirect_to: redirectTo,
        },
      });
      if (result.error || typeof result.data?.action_link !== 'string' || typeof result.data?.username !== 'string') {
        throw await functionError(result.error, result.data, 'No se pudo crear el enlace.');
      }
      setCreated({ username: result.data.username, password: nextPassword, actionLink: result.data.action_link, redirectTo });
      setPassword(newPassword());
      element.reset();
    });
  }

  const activePrincipals = principals.filter(item => item.active);
  return <section className="player-admin login-link-admin" aria-labelledby="login-link-title">
    <div className="account-heading"><div><h1 id="login-link-title">Link</h1><p>Creá el usuario y copiá un enlace temporal. Quien lo abra entra directo a esa cuenta.</p></div></div>
    <form className="player-create" onSubmit={event => void createLink(event)}>
      <div className="player-create-fields">
        <label>Nombre de usuario<input name="username" minLength={3} maxLength={32} pattern={'[a-zA-Z0-9._\\-]+'} autoCapitalize="none" spellCheck={false} placeholder="juanito" required /></label>
        <label>Teléfono del jugador<input name="phone" type="tel" maxLength={30} placeholder="Ej.: +595981123456" required /></label>
        <label>WhatsApp principal<select name="whatsapp_principal_slot" required defaultValue=""><option value="" disabled>Seleccionar principal</option>{activePrincipals.map(item => <option key={item.slot} value={item.slot}>Principal {item.slot} · +{item.phone}</option>)}</select></label>
      </div>
      <p className="login-link-note">El enlace abre {redirectTo}. Dura cerca de una hora, funciona una sola vez y hay que pasarlo en privado. La contraseña se muestra después, por si el enlace ya venció.</p>
      {loadError && <p className="player-form-warning">{loadError}</p>}
      {!loadError && !activePrincipals.length && <p className="player-form-warning">Primero cargá al menos un número en Contactos.</p>}
      <button className="cashier-create-submit" disabled={busy || loading || !activePrincipals.length}><Link2 size={16} aria-hidden="true" /> Crear usuario y generar enlace</button>
    </form>
    {created && <div className="player-create login-link-result">
      <p className="login-link-note">Listo, @{created.username}. Copiá el enlace y pasalo solo a esa persona.</p>
      <div className="login-link-row"><span>Contraseña</span><div><input readOnly value={created.password} aria-label="Contraseña del jugador" /><button type="button" onClick={() => void copyValue(created.password, 'password')}>{copied === 'password' ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}</button></div></div>
      <div className="login-link-row"><span>Enlace temporal</span><div><input readOnly value={created.actionLink} aria-label="Enlace temporal de ingreso" /><button type="button" onClick={() => void copyValue(created.actionLink, 'link')}>{copied === 'link' ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}</button></div></div>
    </div>}
  </section>;
}
