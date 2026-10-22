import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, Check, CircleCheck, Copy, MessageCircle, RotateCcw, Search, Send } from 'lucide-react';
import { date, supabase, type Message } from './lib';
import { needsChatReply, pendingChatCount } from './admin-navigation';
import { parseMessage, parseUuid } from '../supabase/functions/_shared/validation';
import { publicError } from './security';

export type ChatInboxRow = {
  user_id: string; username: string | null; display_name: string | null;
  last_message_id: string; last_sender_id: string; last_body: string; last_created_at: string;
  completed_at: string | null; completed_by: string | null;
};
type Filter = 'pending' | 'all' | 'completed';
const PAGE_SIZE = 50;

function shortDate(value: string) {
  const when = new Date(value);
  const today = new Date();
  return when.toDateString() === today.toDateString()
    ? new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(when)
    : new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(when);
}

export function AdminChat({ inbox, selectedId, demo, onSelect, onChanged }: {
  inbox: ChatInboxRow[]; selectedId: string; demo: boolean;
  onSelect: (id: string) => void; onChanged: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('pending');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const messageLog = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const activeThreadId = useRef(selectedId);
  activeThreadId.current = selectedId;
  const selected = inbox.find(row => row.user_id === selectedId);
  const pending = pendingChatCount(inbox);
  const completed = inbox.filter(row => !!row.completed_at).length;
  const title = (row: ChatInboxRow) => row.username || row.display_name || `Usuario ${row.user_id.slice(0, 8)}`;

  useEffect(() => {
    if (!selectedId || demo || !supabase) { setMessages([]); return; }
    const db = supabase;
    let alive = true;
    stickToBottom.current = true;
    setMessages([]); setHasMore(false); setLoading(true); setError(''); setNotice(''); setCopied(false);
    void db.from('messages').select('id,user_id,sender_id,body,created_at')
      .eq('user_id', selectedId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE)
      .then(({ data, error: loadError }) => {
        if (!alive) return;
        setLoading(false);
        if (loadError) { setError('No pudimos cargar esta conversación. Intentá abrirla nuevamente.'); return; }
        const latest = ((data ?? []) as Message[]).reverse();
        setMessages(old => {
          const seen = new Set(latest.map(item => item.id));
          return [...latest, ...old.filter(item => item.user_id === selectedId && !seen.has(item.id))]
            .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
        });
        setHasMore((data ?? []).length === PAGE_SIZE);
      });
    const channel = db.channel(`admin-chat-${selectedId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${selectedId}` }, payload => {
        const message = payload.new as Message;
        setMessages(old => old.some(item => item.id === message.id) ? old : [...old, message]);
      }).subscribe();
    return () => { alive = false; void db.removeChannel(channel); };
  }, [selectedId, demo]);

  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    if (messageLog.current && stickToBottom.current) messageLog.current.scrollTop = messageLog.current.scrollHeight;
  }, [selectedId, lastMessageId]);

  async function loadOlder() {
    if (!supabase || !selectedId || !messages.length || loadingOlder) return;
    setLoadingOlder(true);
    const oldest = messages[0];
    const viewport = messageLog.current;
    const previousHeight = viewport?.scrollHeight ?? 0;
    const result = await supabase.from('messages').select('id,user_id,sender_id,body,created_at')
      .eq('user_id', selectedId)
      .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE);
    if (activeThreadId.current !== selectedId) return;
    setLoadingOlder(false);
    if (result.error) { setError('No pudimos cargar mensajes anteriores. Intentá nuevamente.'); return; }
    const earlier = ((result.data ?? []) as Message[]).reverse();
    setMessages(old => [...earlier.filter(item => !old.some(current => current.id === item.id)), ...old]);
    setHasMore((result.data ?? []).length === PAGE_SIZE);
    window.requestAnimationFrame(() => { if (viewport) viewport.scrollTop = viewport.scrollHeight - previousHeight + viewport.scrollTop; });
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!sending && !demo && event.currentTarget.value.trim()) event.currentTarget.form?.requestSubmit();
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || demo || sending || !selectedId || selected?.completed_at) return;
    const form = event.currentTarget;
    setSending(true); setError(''); setNotice('');
    try {
      const body = parseMessage(new FormData(form).get('message'));
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) throw new Error('Tu sesión venció. Volvé a ingresar.');
      const { data, error: sendError } = await supabase.from('messages')
        .insert({ user_id: parseUuid(selectedId), sender_id: session.user.id, body })
        .select('id,user_id,sender_id,body,created_at').single();
      if (sendError) throw sendError;
      if (activeThreadId.current === selectedId) {
        setMessages(old => old.some(item => item.id === data.id) ? old : [...old, data as Message]);
        form.reset();
      }
      onChanged();
      const { error: pushError } = await supabase.functions.invoke('send-user-push', { body: { message_id: data.id } });
      if (pushError && activeThreadId.current === selectedId) setNotice('Respuesta enviada. El usuario la verá en el chat y en sus avisos; el push no pudo salir.');
    } catch (cause) { if (activeThreadId.current === selectedId) setError(publicError(cause)); }
    finally { setSending(false); }
  }

  async function copyUsername() {
    if (!selected?.username) return;
    try { await navigator.clipboard.writeText(selected.username); setCopied(true); }
    catch { setError('No pudimos copiar el usuario.'); }
  }

  async function updateStatus(complete: boolean) {
    if (!supabase || demo || updatingStatus || !selected) return;
    const userId = selected.user_id;
    setUpdatingStatus(true); setError(''); setNotice('');
    const { error: statusError } = await supabase.rpc('set_chat_thread_completed', {
      p_user_id: userId, p_last_message_id: selected.last_message_id, p_completed: complete,
    });
    setUpdatingStatus(false);
    if (activeThreadId.current !== userId) return;
    if (statusError) {
      setError(statusError.message.includes('mensajes nuevos')
        ? 'Llegó un mensaje nuevo. Actualizá la conversación antes de cambiar su estado.'
        : 'No pudimos cambiar el estado del chat. Intentá nuevamente.');
      onChanged();
      return;
    }
    onChanged();
    if (complete) onSelect('');
    else setNotice('Conversación reabierta. Ya podés responder.');
  }

  const query = search.trim().toLocaleLowerCase('es');
  const visible = inbox.filter(row => {
    if (filter === 'pending' && !needsChatReply(row)) return false;
    if (filter === 'completed' && !row.completed_at) return false;
    if (!query) return true;
    return [row.username, row.display_name, row.last_body, row.user_id]
      .some(value => value?.toLocaleLowerCase('es').includes(query));
  });

  return <section className={`admin-chat${selectedId ? ' has-selection' : ''}`} aria-label="Bandeja de conversaciones">
    <div className="admin-chat-heading"><div><h1>Chat</h1><p>Respondé las consultas de los jugadores desde una sola bandeja.</p></div><span>{pending} por responder</span></div>
    <div className="admin-chat-layout">
      <aside className="admin-chat-inbox" aria-label="Conversaciones">
        <div className="admin-chat-inbox-header"><strong>Conversaciones</strong><small>{inbox.length} en total</small></div>
        <label className="admin-chat-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Buscar conversación</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Usuario o último mensaje" /></label>
        <div className="admin-chat-filters" role="group" aria-label="Filtrar conversaciones">
          <button type="button" className={filter === 'pending' ? 'active' : ''} aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')}>Por responder <span>{pending}</span></button>
          <button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todas</button>
          <button type="button" className={filter === 'completed' ? 'active' : ''} aria-pressed={filter === 'completed'} onClick={() => setFilter('completed')}>Completadas <span>{completed}</span></button>
        </div>
        <div className="admin-chat-list">
          {visible.length ? visible.map(row => <button type="button" key={row.user_id} className={`admin-chat-item${selectedId === row.user_id ? ' active' : ''}`} aria-current={selectedId === row.user_id ? 'true' : undefined} onClick={() => onSelect(row.user_id)}>
            <span className="admin-chat-avatar">{title(row).slice(0, 1).toUpperCase()}</span>
            <span className="admin-chat-item-main"><span className="admin-chat-item-top"><strong>{title(row)}</strong><time dateTime={row.last_created_at}>{shortDate(row.last_created_at)}</time></span><span className="admin-chat-preview">{row.completed_at ? 'Completado · ' : row.last_sender_id !== row.user_id ? 'Soporte: ' : ''}{row.last_body}</span></span>
            {needsChatReply(row) && <span className="admin-chat-unanswered" aria-label="Por responder" />}
          </button>) : <p className="admin-chat-list-empty">{query ? 'No encontramos conversaciones con esa búsqueda.' : filter === 'pending' ? 'No hay consultas por responder.' : filter === 'completed' ? 'No hay conversaciones completadas.' : 'Todavía no hay conversaciones.'}</p>}
        </div>
      </aside>
      <section className="admin-chat-thread" aria-label={selected ? `Conversación con ${title(selected)}` : 'Seleccioná una conversación'}>
        {selected ? <>
          <header className="admin-chat-thread-header"><button type="button" className="admin-chat-back" aria-label="Volver a conversaciones" onClick={() => onSelect('')}><ArrowLeft size={19} /></button><span className="admin-chat-avatar">{title(selected).slice(0, 1).toUpperCase()}</span><div><strong>{title(selected)}</strong><small>{selected.completed_at ? 'Conversación completada' : needsChatReply(selected) ? 'Consulta por responder' : 'Conversación respondida'}{selected.display_name && selected.display_name !== selected.username ? ` · ${selected.display_name}` : ''}</small></div>{selected.username && <button type="button" className="admin-chat-copy" onClick={() => void copyUsername()} aria-label="Copiar nombre de usuario">{copied ? <Check size={16} /> : <Copy size={16} />}<span>{copied ? 'Copiado' : 'Copiar usuario'}</span></button>}</header>
          <div className="admin-chat-messages" ref={messageLog} role="log" aria-live="polite" aria-relevant="additions text" onScroll={event => { const element = event.currentTarget; stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; }}>{hasMore && <button type="button" className="admin-chat-older" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? 'Cargando…' : 'Ver mensajes anteriores'}</button>}{loading && <p className="admin-chat-list-empty">Cargando conversación…</p>}{messages.map(message => <div className={`message ${message.sender_id !== message.user_id ? 'mine' : ''}`} key={message.id}><p>{message.body}</p><small>{message.sender_id !== message.user_id ? 'Soporte · ' : ''}{date(message.created_at)}</small></div>)}</div>
          {(error || notice) && <p className={`admin-chat-feedback${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</p>}
          <div className="admin-chat-actions"><span>{selected.completed_at ? 'Esta sesión está cerrada. Podés reabrirla para responder.' : 'Cuando termines, marcá la conversación como completada.'}</span><button type="button" className={selected.completed_at ? 'admin-chat-reopen' : 'admin-chat-complete'} disabled={demo || updatingStatus || sending} onClick={() => void updateStatus(!selected.completed_at)}>{selected.completed_at ? <RotateCcw size={16} /> : <CircleCheck size={16} />}{updatingStatus ? 'Guardando…' : selected.completed_at ? 'Reabrir chat' : 'Marcar como completado'}</button></div>
          {!selected.completed_at && <form className="admin-chat-composer" onSubmit={event => void send(event)}><label htmlFor="admin-chat-message" className="sr-only">Responder a {title(selected)}</label><textarea id="admin-chat-message" name="message" placeholder="Escribí tu respuesta…" maxLength={2000} rows={2} required disabled={sending || demo || updatingStatus} onKeyDown={onComposerKeyDown} /><button type="submit" disabled={sending || demo || updatingStatus} aria-label="Enviar respuesta"><Send size={18} /> Enviar</button><small>Enter para enviar · Shift + Enter para nueva línea</small></form>}
        </> : <div className="admin-chat-placeholder"><MessageCircle size={38} /><h2>Elegí una conversación</h2><p>Vas a ver el historial y responder desde acá.</p></div>}
      </section>
    </div>
  </section>;
}
