import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, Eye, EyeOff, MessageCircle, RefreshCw, Send, UserRound, XCircle } from 'lucide-react';
import { date } from './lib';
import { AccessSessionError, invokeAdminPlayerAccess } from './admin-player-access-api';
import { InputError } from '../supabase/functions/_shared/validation';
import { safeHttpsLink } from './security';

type AccessMessage = { id: number; sender: 'player' | 'admin'; body: string; created_at: string };
type Latest = { sender: string; body: string; created_at: string } | null;
type AccessRequest = { id: string; username: string; referral_code: string | null; status: 'pending' | 'approved' | 'rejected'; player_user_id: string | null; has_personal_url: boolean; created_at: string; updated_at: string; latest_message: Latest; same_ip_usernames?: string[] };
function requestPreview(item: AccessRequest) {
  if (item.same_ip_usernames?.length) return `Aviso interno · misma IP que @${item.same_ip_usernames.join(', @')}`;
  if (item.status === 'approved' && !item.has_personal_url) return 'Acceso creado · falta enlace personal';
  return item.latest_message?.body ?? (item.referral_code ? `Recomendado por @${item.referral_code}` : 'Sin código de recomendado');
}

export function AdminPlayerAccess({ demo, busy, action }: { demo: boolean; busy: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<AccessMessage[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [filter, setFilter] = useState<'setup' | 'all'>('setup');
  const [search, setSearch] = useState('');
  const [threadError, setThreadError] = useState('');
  const [playerUsername, setPlayerUsername] = useState('');
  const [password, setPassword] = useState('');
  const [casinoUrl, setCasinoUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const selected = requests.find(item => item.id === selectedId) ?? null;
  const needsSetup = (item: AccessRequest) => item.status === 'pending' || (item.status === 'approved' && !item.has_personal_url);
  const visible = requests.filter(item => (filter === 'all' || needsSetup(item)) && (!search.trim() || `${item.username} ${item.referral_code ?? ''} ${item.latest_message?.body ?? ''}`.toLocaleLowerCase('es').includes(search.trim().replace(/^@/, '').toLocaleLowerCase('es'))));

  async function refresh() {
    if (demo) { setLoading(false); return; }
    const result = await invokeAdminPlayerAccess({ action: 'admin-list' });
    setRequests(result.requests as AccessRequest[]);
    setLoading(false);
    setThreadError('');
  }
  useEffect(() => {
    let alive = true;
    const handleError = (error: unknown) => {
      if (!alive) return;
      setLoading(false);
      setThreadError(error instanceof Error ? error.message : 'No pudimos cargar solicitudes.');
      if (error instanceof AccessSessionError) window.clearInterval(timer);
    };
    const timer = window.setInterval(() => { void refresh().catch(handleError); }, 12000);
    void refresh().catch(handleError);
    return () => { alive = false; window.clearInterval(timer); };
  }, [demo]);
  useEffect(() => {
    if (!selectedId || demo) { setMessages([]); return; }
    let alive = true;
    void invokeAdminPlayerAccess({ action: 'admin-messages', request_id: selectedId }).then(result => { if (alive) { setMessages(result.messages as AccessMessage[]); setCasinoUrl(typeof result.casino_url === 'string' ? result.casino_url : ''); } }).catch(error => { if (alive) setThreadError(error instanceof Error ? error.message : 'No pudimos cargar la conversación.'); });
    return () => { alive = false; };
  }, [selectedId, demo]);
  useEffect(() => {
    if (!selectedId || demo) return;
    const timer = window.setInterval(() => {
      void invokeAdminPlayerAccess({ action: 'admin-messages', request_id: selectedId }).then(result => setMessages(result.messages as AccessMessage[])).catch(error => { if (error instanceof AccessSessionError) window.clearInterval(timer); });
      void refresh().catch(error => { if (error instanceof AccessSessionError) { window.clearInterval(timer); setThreadError(error.message); } });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [selectedId, demo]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages]);
  useEffect(() => { setPlayerUsername(selected?.username ?? ''); setPassword(''); setCasinoUrl(''); setShowPassword(false); }, [selectedId]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    const element = event.currentTarget;
    const body = new FormData(element).get('message');
    await action(async () => {
      await invokeAdminPlayerAccess({ action: 'admin-send', request_id: selected.id, body });
      element.reset(); setThreadError('');
      const result = await invokeAdminPlayerAccess({ action: 'admin-messages', request_id: selected.id });
      setMessages(result.messages as AccessMessage[]); await refresh();
    });
  }
  async function saveAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const link = safeHttpsLink(casinoUrl.trim());
    if (!link) { setThreadError('Ingresá una URL personal HTTPS válida.'); return; }
    if (!window.confirm(selected.status === 'approved' ? `¿Actualizar la contraseña y el enlace personal de @${selected.username}?` : `¿Crear el acceso de @${playerUsername.trim().replace(/^@/, '')} y enviar esos datos al solicitante?`)) return;
    await action(async () => {
      if (password.length < 8 || password.length > 72) throw new InputError('La contraseña debe tener entre 8 y 72 caracteres.');
      const finalUsername = playerUsername.trim().replace(/^@/, '').toLowerCase();
      if (selected.status === 'pending' && !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(finalUsername)) throw new InputError('El usuario debe tener de 3 a 32 caracteres: letras, números, punto, guion o guion bajo.');
      await invokeAdminPlayerAccess({ action: selected.status === 'approved' ? 'admin-configure' : 'admin-approve', request_id: selected.id, username: finalUsername, password, casino_url: link });
      setPassword(''); setCasinoUrl(''); setShowPassword(false); setThreadError('');
      const result = await invokeAdminPlayerAccess({ action: 'admin-messages', request_id: selected.id });
      setMessages(result.messages as AccessMessage[]); setCasinoUrl(typeof result.casino_url === 'string' ? result.casino_url : ''); await refresh();
    });
  }
  async function closeRequest() {
    if (!selected || !window.confirm(`¿Cerrar la solicitud de @${selected.username} sin crear la cuenta?`)) return;
    await action(async () => {
      await invokeAdminPlayerAccess({ action: 'admin-close', request_id: selected.id });
      const result = await invokeAdminPlayerAccess({ action: 'admin-messages', request_id: selected.id });
      setMessages(result.messages as AccessMessage[]); await refresh();
    });
  }

  return <section className="access-admin" aria-label="Solicitudes para crear usuarios">
    <div className="access-admin-heading"><div><h1>Solicitudes</h1><p>Revisá las solicitudes y creá los accesos manualmente.</p></div><button type="button" disabled={loading || busy || demo} onClick={() => { setLoading(true); void refresh().catch(error => setThreadError(error instanceof Error ? error.message : 'No pudimos actualizar.')).finally(() => setLoading(false)); }}><RefreshCw size={16} />Actualizar</button></div>
    {demo && <p className="access-admin-note">La vista previa no carga solicitudes reales.</p>}
    {threadError && <p className="access-admin-error" role="alert">{threadError}</p>}
    <div className="access-admin-layout">
      <aside className="access-admin-inbox">
        <strong>Solicitudes de acceso</strong><small>{requests.filter(needsSetup).length} por configurar · {requests.length} recientes</small>
        <label><span className="sr-only">Buscar solicitud</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar usuario o recomendado" /></label>
        <div className="access-admin-filters"><button type="button" className={filter === 'setup' ? 'active' : ''} onClick={() => setFilter('setup')}>Por configurar</button><button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todas</button></div>
        <div className="access-admin-list">
          {loading ? <p>Cargando solicitudes…</p> : visible.length ? visible.map(item => <button type="button" key={item.id} className={`access-admin-item${selectedId === item.id ? ' active' : ''}`} onClick={() => { setSelectedId(item.id); setThreadError(''); }}><span className="access-admin-avatar"><UserRound size={18} /></span><span><strong>@{item.username}</strong><small>{requestPreview(item)}</small></span><time>{date(item.created_at)}</time><i className={`access-status-dot ${item.status}`} /></button>) : <p>{search ? 'No encontramos coincidencias.' : filter === 'setup' ? 'No hay accesos por configurar.' : 'Todavía no hay solicitudes.'}</p>}
        </div>
      </aside>
      <section className="access-admin-thread" aria-label={selected ? `Solicitud de ${selected.username}` : 'Elegí una solicitud'}>
        {selected ? <>
          <header><span className="access-admin-avatar"><UserRound size={20} /></span><div><strong>@{selected.username}</strong><small>{selected.referral_code ? `Código recomendado: @${selected.referral_code}` : 'Sin código de recomendado'} · {selected.status === 'pending' ? 'Pendiente' : selected.status === 'approved' ? 'Acceso creado' : 'Cerrada'}</small></div></header>
          {!!selected.same_ip_usernames?.length && <p className="access-admin-network-note" role="status">Aviso interno: comparte IP con @{selected.same_ip_usernames.join(', @')}. Esto no impide crear el usuario.</p>}
          <div className="access-admin-messages" ref={log} role="log" aria-live="polite">{messages.map(message => <article key={message.id} className={`access-admin-message${message.sender === 'admin' ? ' from-admin' : ''}`}><p>{message.body}</p><time>{date(message.created_at)}</time></article>)}</div>
          {(selected.status === 'pending' || selected.status === 'approved') && <>
            <form className="access-admin-create" onSubmit={event => void saveAccess(event)}>
              <div className="access-admin-create-heading"><div><h3>{selected.status === 'approved' ? 'Configurar acceso existente' : 'Crear acceso'}</h3><p>{selected.status === 'approved' ? 'Asigná el enlace personal y establecé la contraseña definitiva. Los nuevos datos llegarán al chat del portal.' : 'El usuario solicitado ya está cargado. Definí su contraseña y el enlace que abrirá el banner del casino.'}</p></div></div>
              <div className="access-admin-create-fields">
                <label><span className="access-admin-field-title">Usuario para el acceso</span><input value={playerUsername} onChange={event => setPlayerUsername(event.target.value.toLowerCase())} minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+" autoCapitalize="none" autoComplete="username" readOnly={selected.status === 'approved'} required /><small>{selected.status === 'pending' ? 'Podés corregirlo antes de crear la cuenta; este será el usuario que recibirá.' : 'El usuario ya fue creado.'}</small></label>
                <label><span className="access-admin-field-title">Contraseña definitiva</span><span className="access-admin-password"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
                <label className="access-admin-create-url"><span className="access-admin-field-title">URL personal del casino</span><input type="url" placeholder="https://casino.ejemplo.com/acceso/…" maxLength={2048} value={casinoUrl} onChange={event => setCasinoUrl(event.target.value)} required /><small>Este enlace abrirá el banner «Ir al casino» solamente para este jugador.</small></label>
              </div>
              <div className="access-admin-actions"><button type="submit" disabled={busy || demo || !password || !casinoUrl}><CheckCircle2 size={16} />{selected.status === 'approved' ? 'Guardar y enviar nuevos datos' : 'Crear usuario y enviar acceso'}</button>{selected.status === 'pending' && <button type="button" disabled={busy || demo} onClick={() => void closeRequest()}><XCircle size={16} />Cerrar solicitud</button>}</div>
            </form>
          </>}
          {selected.status === 'pending' && <form className="access-admin-composer" onSubmit={event => void send(event)}><input name="message" maxLength={2000} placeholder="Respondé antes de crear el acceso…" aria-label="Responder al solicitante" required /><button type="submit" disabled={busy || demo} aria-label="Enviar respuesta"><Send size={17} /></button></form>}
        </> : <div className="access-admin-empty"><MessageCircle size={34} /><h2>Elegí una solicitud</h2><p>Vas a poder responder y crear el usuario desde esta conversación.</p></div>}
      </section>
    </div>
  </section>;
}
