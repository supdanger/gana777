import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Dices, Send, UserRound } from 'lucide-react';
import { InputError } from '../supabase/functions/_shared/validation';
import { deviceFootprint } from './device-footprint';
import { supabase } from './lib';

const tokenKey = 'gana777-access-chat-token';
const deviceKey = 'gana777-access-device-id';
type AccessMessage = { id: number; sender: 'player' | 'admin'; body: string; created_at: string };
type AccessThread = { id: string; username: string; referral_code: string | null; status: 'pending' | 'approved' | 'rejected'; created_at: string; updated_at: string; ip_blocked?: boolean };
const casinoNames = ['jackpot', 'ruleta', 'fichero', 'triple777', 'dama', 'blackjack', 'comodin', 'fortuna', 'ganador', 'poker'];

function secret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function localSecret(key: string) {
  let value = localStorage.getItem(key);
  if (!value || value.length < 32) { value = secret(); localStorage.setItem(key, value); }
  return value;
}
function generatedName() {
  const word = casinoNames[crypto.getRandomValues(new Uint32Array(1))[0] % casinoNames.length];
  const number = 100 + crypto.getRandomValues(new Uint32Array(1))[0] % 900;
  return `${word}${number}`;
}
async function callAccess(body: Record<string, unknown>) {
  if (!supabase) throw new InputError('El portal no está conectado. Volvé a intentar más tarde.');
  const { data, error } = await supabase.functions.invoke('player-access', { body });
  if (error || !data?.ok) {
    let message = data?.error;
    if (!message && error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
      try { message = (await error.context.clone().json())?.error; } catch { /* No error payload. */ }
    }
    if (!message && error && typeof error === 'object' && 'context' in error && error.context instanceof Response && error.context.status === 404) message = 'El servicio de solicitudes todavía no está desplegado.';
    throw new InputError(typeof message === 'string' ? message : 'No pudimos conectar con el chat. Probá de nuevo.');
  }
  return data;
}

export function PlayerAccessRequest({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState('');
  const [device, setDevice] = useState('');
  const [thread, setThread] = useState<AccessThread | null>(null);
  const [messages, setMessages] = useState<AccessMessage[]>([]);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentToken = localStorage.getItem(tokenKey) ?? '';
    const currentDevice = localSecret(deviceKey);
    setToken(currentToken); setDevice(currentDevice);
    if (!currentToken) { setRestoring(false); return; }
    let alive = true;
    void callAccess({ action: 'resume', access_token: currentToken }).then(result => {
      if (!alive) return;
      setThread(result.thread as AccessThread); setMessages(result.messages as AccessMessage[]); setUsername((result.thread as AccessThread).username);
    }).catch(() => { if (alive) { localStorage.removeItem(tokenKey); setToken(''); } }).finally(() => { if (alive) setRestoring(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!thread || !token || thread.status === 'rejected') return;
    const refresh = async () => {
      try {
        const result = await callAccess({ action: 'public-messages', access_token: token });
        setThread(result.thread as AccessThread); setMessages(result.messages as AccessMessage[]);
      } catch { /* Keep the last loaded messages during temporary network loss. */ }
    };
    const timer = window.setInterval(() => void refresh(), thread.status === 'pending' ? 4000 : 10000);
    return () => window.clearInterval(timer);
  }, [thread?.id, thread?.status, token]);

  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages]);

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    const currentToken = token || secret();
    const currentDevice = device || localSecret(deviceKey);
    localStorage.setItem(tokenKey, currentToken);
    setToken(currentToken); setDevice(currentDevice);
    try {
      const result = await callAccess({ action: 'create', username: form.get('username'), referral_code: form.get('referral_code'), access_token: currentToken, device_id: currentDevice, footprint: await deviceFootprint(), website: form.get('website') });
      setUsername(String(result.username));
      const resumed = await callAccess({ action: 'resume', access_token: currentToken });
      setThread(resumed.thread as AccessThread); setMessages(resumed.messages as AccessMessage[]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No pudimos iniciar la solicitud.'); }
    finally { setBusy(false); }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!token) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    setError(''); setBusy(true);
    try {
      await callAccess({ action: 'public-send', access_token: token, body: form.get('message') });
      element.reset();
      const result = await callAccess({ action: 'resume', access_token: token });
      setThread(result.thread as AccessThread); setMessages(result.messages as AccessMessage[]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No pudimos enviar el mensaje.'); }
    finally { setBusy(false); }
  }
  function newRequest() {
    localStorage.removeItem(tokenKey);
    setToken(''); setThread(null); setMessages([]); setUsername(''); setError('');
  }

  return <section className="card player-access-card">
    <header><div><h2>{thread ? `Solicitud de @${thread.username}` : 'Crear usuario'}</h2><p>{thread ? 'Conversá con el equipo de GANA777 desde este dispositivo.' : 'Elegí tu nombre de usuario y, si tenés, agregá el código de quien te recomendó.'}</p></div><button type="button" className="player-access-back" onClick={onBack} aria-label="Volver al ingreso"><ArrowLeft size={18} /></button></header>
    {!thread ? <form className="player-access-form" onSubmit={event => void createRequest(event)}>
      <label>Nombre de usuario<div className="player-access-name"><UserRound size={18} /><input name="username" value={username} onChange={event => setUsername(event.target.value.toLowerCase())} minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+" autoCapitalize="none" autoComplete="username" placeholder="Ej.: jackpot777" required /><button type="button" onClick={() => setUsername(generatedName())}><Dices size={17} />Generar</button></div></label>
      <label>Código de recomendado <span>(opcional)</span><input name="referral_code" maxLength={33} autoCapitalize="none" spellCheck={false} placeholder="Nombre de usuario de quien te recomendó" /></label>
      <label className="player-access-honeypot" aria-hidden="true">Dejar vacío<input name="website" tabIndex={-1} autoComplete="off" /></label>
      {error && <p className="player-access-error" role="alert">{error}</p>}
      <button className="primary" disabled={busy || restoring}>{restoring ? 'Cargando…' : busy ? 'Enviando solicitud…' : 'Solicitar usuario'}</button>
      <small>La cuenta se crea manualmente después de revisar tu solicitud. No envíes documentos ni datos bancarios por este chat.</small>
      <small>Cada celular puede pedir una sola cuenta, aunque se borren los datos del navegador. Otra persona en la misma WiFi puede pedir la suya.</small>
    </form> : <>
      <div className={`player-access-status${thread.ip_blocked ? ' is-blocked' : ''}`}><strong>{thread.ip_blocked ? 'No se crea otra cuenta' : thread.status === 'approved' ? 'Usuario creado' : thread.status === 'rejected' ? 'Solicitud cerrada' : 'Esperando al equipo'}</strong><span>{thread.ip_blocked ? 'Este celular ya tiene un usuario.' : `Usuario solicitado: @${thread.username}`}</span>{thread.referral_code && !thread.ip_blocked && <small>Recomendado por @{thread.referral_code}</small>}</div>
      <div className="player-access-messages" ref={log} role="log" aria-live="polite">
        {messages.map(message => <article key={message.id} className={`player-access-message${message.sender === 'admin' ? ' from-admin' : ''}`}><p>{message.body}</p><time>{new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(message.created_at))}</time></article>)}
      </div>
      {thread.status === 'pending' && <form className="player-access-composer" onSubmit={event => void sendMessage(event)}><input name="message" maxLength={2000} autoComplete="off" placeholder="Escribí un mensaje…" aria-label="Mensaje para soporte" required /><button type="submit" disabled={busy} aria-label="Enviar mensaje"><Send size={18} /></button></form>}
      {thread.status === 'rejected' && <button type="button" className="player-access-new-request" onClick={newRequest}>Iniciar otra solicitud</button>}
      {error && <p className="player-access-error" role="alert">{error}</p>}
      <small>Guardamos esta conversación en este navegador para que puedas retomarla sin iniciar sesión.</small>
    </>}
  </section>;
}
