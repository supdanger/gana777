import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CircleCheck, Link2, MessageCircle, RotateCcw, Search, Send } from 'lucide-react';
import { date, supabase } from './lib';
import { parseMessage } from '../supabase/functions/_shared/validation';
import { InputError } from '../supabase/functions/_shared/validation';

export type ExternalChatInboxRow = {
  thread_id: string; nickname: string; origin: string; created_at: string; last_seen_at: string;
  completed_at: string | null; completed_by: string | null; last_message_id: string;
  last_sender_type: 'visitor' | 'staff'; last_body: string; last_message_at: string;
};
type ExternalMessage = { id: string; thread_id: string; sender_type: 'visitor' | 'staff'; sender_id: string | null; body: string; attachment_path: string | null; created_at: string };

function ExternalChatImage({ path }: { path: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    void supabase?.storage.from('external-chat-files').createSignedUrl(path, 3600).then(({ data }) => {
      if (active) setUrl(data?.signedUrl ?? '');
    });
    return () => { active = false; };
  }, [path]);
  return url ? <a className="external-chat-image-link" href={url} target="_blank" rel="noreferrer"><img className="external-chat-image" src={url} alt="Imagen adjunta por el visitante" loading="lazy" /></a> : <small className="external-chat-image-loading">Cargando imagen adjunta…</small>;
}

function shortDate(value: string) {
  const when = new Date(value);
  return when.toDateString() === new Date().toDateString()
    ? new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(when)
    : new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(when);
}

export function AdminExternalChat({ inbox, selectedId, demo, canLink, onSelect, onChanged, onLinked }: {
  inbox: ExternalChatInboxRow[]; selectedId: string; demo: boolean; canLink: boolean;
  onSelect: (id: string) => void; onChanged: () => void; onLinked: (userId: string) => void;
}) {
  const [messages, setMessages] = useState<ExternalMessage[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'pending' | 'all' | 'completed'>('pending');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [linkUsername, setLinkUsername] = useState('');
  const [linkMatch, setLinkMatch] = useState<{ user_id: string; username: string; display_name: string | null } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const activeId = useRef(selectedId);
  activeId.current = selectedId;
  const selected = inbox.find(row => row.thread_id === selectedId);
  const pending = inbox.filter(row => !row.completed_at && row.last_sender_type === 'visitor').length;
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
    setMessages([]); setLoading(true); setError(''); setNotice(''); setLinkUsername(''); setLinkMatch(null);
    void db.from('external_chat_messages').select('id,thread_id,sender_type,sender_id,body,attachment_path,created_at')
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
      .select('id,thread_id,sender_type,sender_id,body,attachment_path,created_at').single();
    setSending(false);
    if (activeId.current !== threadId) return;
    if (result.error || !result.data) { setError(result.error?.message.includes('vinculada') ? 'Esta conversación ya está vinculada. Abrila desde Chat.' : 'No pudimos enviar la respuesta. Intentá nuevamente.'); onChanged(); return; }
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

  async function findPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || demo || !canLink || !selected || linkBusy) return;
    const username = linkUsername.trim().toLowerCase();
    setLinkMatch(null); setError(''); setNotice('');
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) { setError('Ingresá el usuario exacto del jugador.'); return; }
    setLinkBusy(true);
    const { data, error: lookupError } = await supabase.from('player_directory')
      .select('user_id,username,display_name').eq('username', username).maybeSingle();
    setLinkBusy(false);
    if (lookupError) { setError('No pudimos buscar el jugador. Intentá nuevamente.'); return; }
    if (!data?.user_id || !data.username) { setError('No encontramos una cuenta con ese usuario.'); return; }
    setLinkMatch(data as { user_id: string; username: string; display_name: string | null });
  }

  async function linkPlayer() {
    if (!supabase || demo || !canLink || !selected || !linkMatch || linkBusy) return;
    const threadId = selected.thread_id;
    setLinkBusy(true); setError(''); setNotice('');
    const { data, error: linkError } = await supabase.rpc('link_external_chat', {
      p_thread_id: threadId, p_username: linkMatch.username,
    });
    setLinkBusy(false);
    if (linkError || data !== linkMatch.user_id) {
      setError(linkError?.message || 'No pudimos vincular esta conversación. Actualizá y volvé a intentar.');
      return;
    }
    onChanged();
    onLinked(data);
  }

  return <section className={`admin-chat external-chat-admin-view${selectedId ? ' has-selection' : ''}`} aria-label="Bandeja de chats externos">
    <div className="admin-chat-heading"><div><h1>Chat externo</h1><p>Atendé las consultas que llegan desde la burbuja de gana777bet.com.</p></div><span>{pending} por responder</span></div>
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
            <span className="admin-chat-item-main"><span className="admin-chat-item-top"><strong>{['https://gana777.vercel.app', 'https://gana777bet.online'].includes(row.origin) ? `PRUEBA · ${row.nickname}` : row.nickname}</strong><time dateTime={row.last_message_at}>{shortDate(row.last_message_at)}</time></span><span className="admin-chat-preview">{row.completed_at ? 'Completado · ' : row.last_sender_type === 'staff' ? 'Soporte: ' : ''}{row.last_body}</span></span>
            {!row.completed_at && row.last_sender_type === 'visitor' && <span className="admin-chat-unanswered" aria-label="Por responder" />}
          </button>) : <p className="admin-chat-list-empty">{search ? 'No encontramos apodos con esa búsqueda.' : filter === 'pending' ? 'No hay consultas por responder.' : filter === 'completed' ? 'No hay conversaciones completadas.' : 'Todavía no hay chats externos.'}</p>}
        </div>
      </aside>
      <section className="admin-chat-thread" aria-label={selected ? `Conversación con ${selected.nickname}` : 'Seleccioná una conversación'}>
        {selected ? <>
          <header className="admin-chat-thread-header"><button type="button" className="admin-chat-back" aria-label="Volver a conversaciones" onClick={() => onSelect('')}><ArrowLeft size={19} /></button><span className="admin-chat-avatar">{selected.nickname.slice(0, 1).toUpperCase()}</span><div><strong>{['https://gana777.vercel.app', 'https://gana777bet.online'].includes(selected.origin) ? `PRUEBA · ${selected.nickname}` : selected.nickname}</strong><small>{selected.completed_at ? 'Conversación completada' : ['https://gana777.vercel.app', 'https://gana777bet.online'].includes(selected.origin) ? 'Chat desde la página de prueba' : 'Chat de la plataforma externa'}</small></div></header>
          <div className="admin-chat-actions"><button type="button" className={selected.completed_at ? 'admin-chat-reopen' : 'admin-chat-complete'} disabled={demo || updating || sending || linkBusy} onClick={() => void setCompleted(!selected.completed_at)}>{selected.completed_at ? <RotateCcw size={16} /> : <CircleCheck size={16} />}{updating ? 'Guardando…' : selected.completed_at ? 'Reabrir chat' : 'Marcar como completado'}</button></div>
          {canLink && <div className="external-chat-link"><div><Link2 size={18} /><strong>Vincular con un jugador</strong></div><p>Buscá el usuario que te indicó. Al vincularlo, este chat seguirá en la bandeja Chat junto con los mensajes de la app.</p><form onSubmit={event => void findPlayer(event)}><input aria-label="Usuario del jugador" value={linkUsername} onChange={event => { setLinkUsername(event.target.value); setLinkMatch(null); }} placeholder="Nombre de usuario exacto" autoCapitalize="none" spellCheck={false} maxLength={32} disabled={demo || linkBusy} /><button type="submit" disabled={demo || linkBusy || !linkUsername.trim()}>Buscar</button></form>{linkMatch && <div className="external-chat-link-match"><span><strong>@{linkMatch.username}</strong><small>{linkMatch.display_name || 'Jugador registrado'}</small></span><button type="button" disabled={demo || linkBusy} onClick={() => void linkPlayer()}>{linkBusy ? 'Vinculando…' : 'Vincular y abrir Chat'}</button></div>}</div>}
          <div className="admin-chat-messages" ref={log} role="log" aria-live="polite" aria-relevant="additions text">{loading && <p className="admin-chat-list-empty">Cargando conversación…</p>}{messages.map(message => <div className={`message${message.sender_type === 'staff' ? ' mine' : ''}`} key={message.id}>{message.body !== 'Imagen adjunta' && <p>{message.body}</p>}{message.attachment_path && <ExternalChatImage path={message.attachment_path} />}<small>{message.sender_type === 'staff' ? 'Soporte · ' : ''}{date(message.created_at)}</small></div>)}</div>
          {(error || notice) && <p className={`admin-chat-feedback${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</p>}
          {!selected.completed_at && <form className="admin-chat-composer" onSubmit={event => void send(event)}><label htmlFor="external-chat-message" className="sr-only">Responder a {selected.nickname}</label><textarea id="external-chat-message" name="message" placeholder="Escribí tu respuesta…" maxLength={2000} rows={2} required disabled={sending || demo || updating} /><button type="submit" disabled={sending || demo || updating} aria-label="Enviar respuesta"><Send size={18} /> Enviar</button><small>Enter para enviar · Shift + Enter para nueva línea</small></form>}
        </> : <div className="admin-chat-placeholder"><MessageCircle size={38} /><h2>Elegí una conversación</h2><p>Vas a ver el historial y responder desde acá.</p></div>}
      </section>
    </div>
  </section>;
}
