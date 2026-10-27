import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CircleCheck, Copy, MessageCircle, RotateCcw, Search, Send, Check } from 'lucide-react';
import { date, supabase } from './lib';
import { parseMessage } from '../supabase/functions/_shared/validation';
import { InputError } from '../supabase/functions/_shared/validation';

export type ExternalChatInboxRow = {
  thread_id: string; nickname: string; origin: string; created_at: string; last_seen_at: string;
  completed_at: string | null; completed_by: string | null; last_message_id: string;
  last_sender_type: 'visitor' | 'staff'; last_body: string; last_message_at: string;
};
type ExternalMessage = { id: string; thread_id: string; sender_type: 'visitor' | 'staff'; sender_id: string | null; body: string; created_at: string };

function shortDate(value: string) {
  const when = new Date(value);
  return when.toDateString() === new Date().toDateString()
    ? new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(when)
    : new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(when);
}

export function AdminExternalChat({ inbox, selectedId, demo, onSelect, onChanged }: {
  inbox: ExternalChatInboxRow[]; selectedId: string; demo: boolean;
  onSelect: (id: string) => void; onChanged: () => void;
}) {
  const [messages, setMessages] = useState<ExternalMessage[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'pending' | 'all' | 'completed'>('pending');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const activeId = useRef(selectedId);
  activeId.current = selectedId;
  const selected = inbox.find(row => row.thread_id === selectedId);
  const pending = inbox.filter(row => !row.completed_at && row.last_sender_type === 'visitor').length;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
  const integrationCode = supabaseUrl && publicKey
    ? `<script async src="https://gana777.vercel.app/external-chat-widget.js" data-endpoint="${supabaseUrl}/functions/v1/external-chat" data-key="${publicKey}"></script>`
    : '';
  const visible = inbox.filter(row => {
    if (filter === 'pending' && (row.completed_at || row.last_sender_type !== 'visitor')) return false;
    if (filter === 'completed' && !row.completed_at) return false;
    const needle = search.trim().toLocaleLowerCase();
    return !needle || `${row.nickname} ${row.last_body}`.toLocaleLowerCase().includes(needle);
  });

  useEffect(() => {
    if (!selectedId || demo || !supabase) { setMessages([]); return; }
    const db = supabase;
    let alive = true;
    setMessages([]); setLoading(true); setError(''); setNotice('');
    void db.from('external_chat_messages').select('id,thread_id,sender_type,sender_id,body,created_at')
      .eq('thread_id', selectedId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100)
      .then(({ data, error: loadError }) => {
        if (!alive) return;
        setLoading(false);
        if (loadError) { setError('No pudimos cargar esta conversación. Intentá abrirla nuevamente.'); return; }
        setMessages(((data ?? []) as ExternalMessage[]).reverse());
      });
    const channel = db.channel(`external-chat-thread-${selectedId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'external_chat_messages', filter: `thread_id=eq.${selectedId}` }, payload => {
        const message = payload.new as ExternalMessage;
        setMessages(old => old.some(item => item.id === message.id) ? old : [...old, message]);
      }).subscribe();
    return () => { alive = false; void db.removeChannel(channel); };
  }, [selectedId, demo]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages.length, selectedId]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || demo || sending || !selected || selected.completed_at) return;
    const data = new FormData(event.currentTarget);
    let body: string;
    try { body = parseMessage(data.get('message')); }
    catch (cause) { setError(cause instanceof InputError ? cause.message : 'Escribí un mensaje válido.'); return; }
    const form = event.currentTarget;
    const threadId = selected.thread_id;
    setSending(true); setError(''); setNotice('');
    const auth = await supabase.auth.getUser();
    if (!auth.data.user) { setSending(false); setError('Tu sesión venció. Volvé a ingresar.'); return; }
    const result = await supabase.from('external_chat_messages').insert({ thread_id: threadId, sender_type: 'staff', sender_id: auth.data.user.id, body })
      .select('id,thread_id,sender_type,sender_id,body,created_at').single();
    setSending(false);
    if (activeId.current !== threadId) return;
    if (result.error || !result.data) { setError('No pudimos enviar la respuesta. Intentá nuevamente.'); return; }
    setMessages(old => old.some(item => item.id === result.data.id) ? old : [...old, result.data as ExternalMessage]);
    form.reset(); onChanged();
  }

  async function setCompleted(complete: boolean) {
    if (!supabase || demo || !selected || updating) return;
    setUpdating(true); setError(''); setNotice('');
    const user = await supabase.auth.getUser();
    const result = await supabase.from('external_chat_threads').update({
      completed_at: complete ? new Date().toISOString() : null,
      completed_by: complete ? user.data.user?.id ?? null : null,
    }).eq('id', selected.thread_id);
    setUpdating(false);
    if (result.error) { setError('No pudimos actualizar el estado del chat. Intentá nuevamente.'); return; }
    onChanged();
    if (complete) onSelect('');
    else setNotice('Conversación reabierta. Ya podés responder.');
  }

  async function copyCode() {
    if (!integrationCode) return;
    try { await navigator.clipboard.writeText(integrationCode); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError('No pudimos copiar el código. Seleccionalo y copialo manualmente.'); }
  }

  return <section className={`admin-chat${selectedId ? ' has-selection' : ''}`} aria-label="Bandeja de chats externos">
    <div className="admin-chat-heading"><div><h1>Chat externo</h1><p>Atendé las consultas que llegan desde la burbuja de gana777bet.com.</p></div><span>{pending} por responder</span></div>
    <article className="card external-chat-install"><div><strong>Código para integrar la burbuja</strong><p>Copialo y pasáselo al equipo de la plataforma para que lo agregue al HTML de gana777bet.com.</p></div><textarea aria-label="Código de instalación del chat" readOnly value={integrationCode || 'Configurá la URL y la clave pública de Supabase para generar el código.'} rows={3} /><button type="button" className="external-chat-copy" disabled={!integrationCode} onClick={() => void copyCode()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copiado' : 'Copiar código'}</button><small>La clave incluida es pública para el navegador; no contiene credenciales administrativas.</small></article>
    <div className="admin-chat-layout">
      <aside className="admin-chat-inbox" aria-label="Conversaciones externas">
        <div className="admin-chat-inbox-header"><strong>Conversaciones</strong><small>{inbox.length} en total</small></div>
        <label className="admin-chat-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Buscar conversación</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Apodo o último mensaje" /></label>
        <div className="admin-chat-filters" role="group" aria-label="Filtrar conversaciones">
          {(['pending', 'all', 'completed'] as const).map(value => <button key={value} type="button" className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'pending' ? 'Pendientes' : value === 'all' ? 'Todas' : 'Completadas'}</button>)}
        </div>
        <div className="admin-chat-list">
          {visible.length ? visible.map(row => <button type="button" key={row.thread_id} className={`admin-chat-item${selectedId === row.thread_id ? ' active' : ''}`} aria-current={selectedId === row.thread_id ? 'true' : undefined} onClick={() => onSelect(row.thread_id)}>
            <span className="admin-chat-avatar">{row.nickname.slice(0, 1).toUpperCase()}</span>
            <span className="admin-chat-item-main"><span className="admin-chat-item-top"><strong>{row.origin === 'https://gana777.vercel.app' ? `PRUEBA · ${row.nickname}` : row.nickname}</strong><time dateTime={row.last_message_at}>{shortDate(row.last_message_at)}</time></span><span className="admin-chat-preview">{row.completed_at ? 'Completado · ' : row.last_sender_type === 'staff' ? 'Soporte: ' : ''}{row.last_body}</span></span>
            {!row.completed_at && row.last_sender_type === 'visitor' && <span className="admin-chat-unanswered" aria-label="Por responder" />}
          </button>) : <p className="admin-chat-list-empty">{search ? 'No encontramos apodos con esa búsqueda.' : filter === 'pending' ? 'No hay consultas por responder.' : filter === 'completed' ? 'No hay conversaciones completadas.' : 'Todavía no hay chats externos.'}</p>}
        </div>
      </aside>
      <section className="admin-chat-thread" aria-label={selected ? `Conversación con ${selected.nickname}` : 'Seleccioná una conversación'}>
        {selected ? <>
          <header className="admin-chat-thread-header"><button type="button" className="admin-chat-back" aria-label="Volver a conversaciones" onClick={() => onSelect('')}><ArrowLeft size={19} /></button><span className="admin-chat-avatar">{selected.nickname.slice(0, 1).toUpperCase()}</span><div><strong>{selected.origin === 'https://gana777.vercel.app' ? `PRUEBA · ${selected.nickname}` : selected.nickname}</strong><small>{selected.completed_at ? 'Conversación completada' : selected.origin === 'https://gana777.vercel.app' ? 'Chat desde la página de prueba' : 'Chat de la plataforma externa'}</small></div></header>
          <div className="admin-chat-actions"><button type="button" className={selected.completed_at ? 'admin-chat-reopen' : 'admin-chat-complete'} disabled={demo || updating || sending} onClick={() => void setCompleted(!selected.completed_at)}>{selected.completed_at ? <RotateCcw size={16} /> : <CircleCheck size={16} />}{updating ? 'Guardando…' : selected.completed_at ? 'Reabrir chat' : 'Marcar como completado'}</button></div>
          <div className="admin-chat-messages" ref={log} role="log" aria-live="polite" aria-relevant="additions text">{loading && <p className="admin-chat-list-empty">Cargando conversación…</p>}{messages.map(message => <div className={`message${message.sender_type === 'staff' ? ' mine' : ''}`} key={message.id}><p>{message.body}</p><small>{message.sender_type === 'staff' ? 'Soporte · ' : ''}{date(message.created_at)}</small></div>)}</div>
          {(error || notice) && <p className={`admin-chat-feedback${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</p>}
          {!selected.completed_at && <form className="admin-chat-composer" onSubmit={event => void send(event)}><label htmlFor="external-chat-message" className="sr-only">Responder a {selected.nickname}</label><textarea id="external-chat-message" name="message" placeholder="Escribí tu respuesta…" maxLength={2000} rows={2} required disabled={sending || demo || updating} /><button type="submit" disabled={sending || demo || updating} aria-label="Enviar respuesta"><Send size={18} /> Enviar</button><small>Enter para enviar · Shift + Enter para nueva línea</small></form>}
        </> : <div className="admin-chat-placeholder"><MessageCircle size={38} /><h2>Elegí una conversación</h2><p>Vas a ver el historial y responder desde acá.</p></div>}
      </section>
    </div>
  </section>;
}
