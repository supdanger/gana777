import { AttentionConversationList, useAttentionList } from './attention-conversation-list';
import { mergeMessages } from './query-utils';
import type { InboxPagination } from './inbox-data';
import { InboxPager } from './inbox-pager';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CircleCheck, Link2, MessageCircle, RotateCcw, Search, Send } from 'lucide-react';
import { useAdminRefreshVersion } from './admin-refresh';
import { date, supabase } from './lib';
import { ChatImage } from './chat-images';
import { parseMessage } from '../supabase/functions/_shared/validation';
import { InputError } from '../supabase/functions/_shared/validation';
import { ChatMessageText, EntryLinkBar, createEntryMessage } from './chat-entry';
import { entryPreview, isEntryBody } from './entry-link';

export type ExternalChatInboxRow = {
  thread_id: string; nickname: string; origin: string; created_at: string; last_seen_at: string;
  completed_at: string | null; completed_by: string | null; last_message_id: string;
  last_sender_type: 'visitor' | 'staff'; last_body: string; last_message_at: string;
};
type ExternalMessage = { id: string; thread_id: string; sender_type: 'visitor' | 'staff'; sender_id: string | null; body: string; attachment_path: string | null; created_at: string };


export function AdminExternalChat({ inbox, selectedId, demo, canLink, onSelect, onChanged, onLinked, pagination }: {
  pagination?: InboxPagination;
  inbox: ExternalChatInboxRow[]; selectedId: string; demo: boolean; canLink: boolean;
  onSelect: (id: string) => void; onChanged: () => void; onLinked: (userId: string) => void;
}) {
  const { listRef, select, threadHeadingRef } = useAttentionList(selectedId, onSelect);
  const [messages, setMessages] = useState<ExternalMessage[]>([]);
  const [search, setSearch] = useState(pagination?.search ?? '');
  const [filter, setFilter] = useState<'pending' | 'waiting' | 'all' | 'completed'>(pagination?.filter ?? 'all');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [linkUsername, setLinkUsername] = useState('');
  const [linkMatch, setLinkMatch] = useState<{ user_id: string; username: string; display_name: string | null } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [entryUser, setEntryUser] = useState('');
  const [sendingEntry, setSendingEntry] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const adminRefresh = useAdminRefreshVersion();
  const activeId = useRef(selectedId);
  activeId.current = selectedId;
  const selectedSnapshot = useRef<ExternalChatInboxRow | undefined>(undefined);
  const currentSelected = inbox.find(row => row.thread_id === selectedId);
  const [selectedFallback, setSelectedFallback] = useState<ExternalChatInboxRow | undefined>(undefined);
  if (currentSelected && (selectedSnapshot.current?.thread_id !== selectedId || currentSelected.last_message_at >= selectedSnapshot.current.last_message_at)) selectedSnapshot.current = currentSelected;
  if (!currentSelected && selectedFallback?.thread_id === selectedId && selectedSnapshot.current?.thread_id !== selectedId) selectedSnapshot.current = selectedFallback;
  const latestVisibleMessage = messages.at(-1);
  if (latestVisibleMessage?.thread_id === selectedId && selectedSnapshot.current?.thread_id === selectedId && latestVisibleMessage.created_at >= selectedSnapshot.current.last_message_at) {
    selectedSnapshot.current = { ...selectedSnapshot.current, last_message_id: latestVisibleMessage.id, last_message_at: latestVisibleMessage.created_at, last_body: latestVisibleMessage.body, last_sender_type: latestVisibleMessage.sender_type };
  }
  const selected = selectedSnapshot.current?.thread_id === selectedId ? selectedSnapshot.current : undefined;
  useEffect(() => {
    if (!selectedId || demo || !supabase || currentSelected || selectedSnapshot.current?.thread_id === selectedId) return;
    const controller = new AbortController();
    void supabase.from('external_chat_inbox').select('*').eq('thread_id', selectedId).abortSignal(controller.signal).maybeSingle().then(({ data, error }) => {
      if (!controller.signal.aborted && !error && data) setSelectedFallback(data as ExternalChatInboxRow);
    });
    return () => controller.abort();
  }, [selectedId, demo, inbox]);
  const onQueryRef = useRef(pagination?.onQuery);
  onQueryRef.current = pagination?.onQuery;
  useEffect(() => { onQueryRef.current?.(search, filter); }, [search, filter]);
  const pending = pagination?.pending ?? inbox.filter(row => !row.completed_at && row.last_sender_type === 'visitor').length;
  const visible = pagination ? inbox : inbox.filter(row => {
    if (filter === 'pending' && (row.completed_at || row.last_sender_type !== 'visitor')) return false;
    if (filter === 'completed' && !row.completed_at) return false;
    if (filter === 'waiting' && (row.completed_at || row.last_sender_type !== 'staff')) return false;
    const needle = search.trim().toLocaleLowerCase();
    return !needle || `${row.nickname} ${entryPreview(row.last_body)}`.toLocaleLowerCase().includes(needle);
  }).sort((a, b) => filter === 'pending' ? a.last_message_at.localeCompare(b.last_message_at) || a.last_message_id.localeCompare(b.last_message_id) : 0);

  useEffect(() => {
    if (!selectedId || demo) { setMessages([]); return; }
    setMessages([]); setHasMore(false); setLoadingOlder(false); setError(''); setNotice(''); setLinkUsername(''); setLinkMatch(null);
  }, [selectedId, demo]);
  useEffect(() => {
    if (!selectedId || demo || !supabase) return;
    const db = supabase;
    let alive = true;
    setLoading(true);
    void db.from('external_chat_messages').select('id,thread_id,sender_type,sender_id,body,attachment_path,created_at')
      .eq('thread_id', selectedId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50)
      .then(({ data, error: loadError }) => {
        if (!alive) return;
        setLoading(false);
        if (loadError) { setError('No pudimos cargar esta conversación. Intentá abrirla nuevamente.'); return; }
        setMessages(old => mergeMessages(old.filter(row => row.thread_id === selectedId), (data ?? []) as ExternalMessage[]));
        setHasMore((data ?? []).length === 50);
      });
    return () => { alive = false; };
  }, [selectedId, demo, adminRefresh]);

  useEffect(() => {
    if (log.current && !loadingOlder) log.current.scrollTop = log.current.scrollHeight;
  }, [messages.at(-1)?.id, selectedId]);

  async function loadOlder() {
    if (!supabase || !selectedId || !messages.length || loadingOlder) return;
    const oldest = messages[0];
    const viewport = log.current;
    const height = viewport?.scrollHeight ?? 0;
    const top = viewport?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      const result = await supabase.from('external_chat_messages').select('id,thread_id,sender_type,sender_id,body,attachment_path,created_at')
        .eq('thread_id', selectedId).or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50);
      if (activeId.current !== selectedId) return;
      if (result.error) throw result.error;
      setMessages(old => mergeMessages(old, (result.data ?? []) as ExternalMessage[]));
      setHasMore((result.data ?? []).length === 50);
      requestAnimationFrame(() => { if (viewport) viewport.scrollTop = top + viewport.scrollHeight - height; });
    } catch { if (activeId.current === selectedId) setError('No pudimos cargar mensajes anteriores. Intentá nuevamente.'); }
    finally { if (activeId.current === selectedId) setLoadingOlder(false); }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || demo || sending || sendingEntry || !selected || selected.completed_at) return;
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

  async function sendEntry() {
    if (!supabase || demo || sending || sendingEntry || !selected || selected.completed_at) return;
    const threadId = selected.thread_id;
    setSendingEntry(true); setError(''); setNotice('');
    try {
      const body = await createEntryMessage(entryUser);
      const auth = await supabase.auth.getUser();
      if (!auth.data.user) throw new InputError('Tu sesión venció. Volvé a ingresar.');
      const result = await supabase.from('external_chat_messages').insert({ thread_id: threadId, sender_type: 'staff', sender_id: auth.data.user.id, body })
        .select('id,thread_id,sender_type,sender_id,body,attachment_path,created_at').single();
      if (activeId.current !== threadId) return;
      if (result.error || !result.data) throw new InputError(result.error?.message.includes('vinculada') ? 'Esta conversación ya está vinculada. Abrila desde Chat.' : 'No pudimos mandar el botón Entrar. Intentá nuevamente.');
      setMessages(old => old.some(item => item.id === result.data.id) ? old : [...old, result.data as ExternalMessage]);
      setNotice('Listo. Le mandamos el botón Entrar.');
      onChanged();
    } catch (cause) {
      if (activeId.current === threadId) setError(cause instanceof InputError ? cause.message : 'No pudimos mandar el botón Entrar. Intentá nuevamente.');
    } finally { setSendingEntry(false); }
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

  return <section className={`admin-chat external-chat-admin-view attention-list-view${selectedId ? ' has-selection' : ''}`} aria-label="Bandeja de chats externos">
    <div className="admin-chat-heading"><div><h2>Chat externo</h2><p>Atendé las consultas que llegan desde la burbuja de gana777bet.com.</p></div><span>{pending} por responder</span></div>
    {selectedId && <div className="attention-thread-toolbar"><button type="button" className="attention-return" onClick={() => onSelect('')}><ArrowLeft size={17} />Volver a conversaciones</button></div>}
    <div className="admin-chat-layout">
      <aside hidden={!!selectedId} className="admin-chat-inbox" aria-label="Conversaciones externas">
        <div className="admin-chat-inbox-header"><strong>Conversaciones</strong><small>{pagination?.all ?? inbox.length} en total</small></div>
        <label className="admin-chat-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Buscar conversación</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Apodo o último mensaje" /></label>
        <div className="admin-chat-filters" role="group" aria-label="Filtrar conversaciones">
          {(['pending', 'waiting', 'all', 'completed'] as const).map(value => <button key={value} type="button" className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'pending' ? 'Pendientes' : value === 'waiting' ? 'Esperando al visitante' : value === 'all' ? 'Todas' : 'Completadas'}</button>)}
        </div>
        <AttentionConversationList external listRef={listRef} onSelect={select} rows={visible.map(row => ({ id: row.thread_id, name: ['https://gana777.vercel.app', 'https://gana777bet.online'].includes(row.origin) ? `PRUEBA · ${row.nickname}` : row.nickname, preview: row.last_body, origin: 'Burbuja', timestamp: row.last_message_at, pending: !row.completed_at && row.last_sender_type === 'visitor', completed: !!row.completed_at, fromSupport: row.last_sender_type === 'staff' }))} empty={search ? 'No encontramos conversaciones con esa búsqueda.' : filter === 'pending' ? 'No hay consultas por responder.' : filter === 'waiting' ? 'No hay conversaciones esperando al visitante.' : filter === 'completed' ? 'No hay conversaciones completadas.' : 'Todavía no hay chats externos.'} />
        <InboxPager pagination={pagination} />
      </aside>
      <section hidden={!selectedId} className="admin-chat-thread" aria-label={selected ? `Conversación con ${selected.nickname}` : 'Seleccioná una conversación'}>
        {selected ? <>
          <header className="admin-chat-thread-header"><button type="button" className="admin-chat-back" aria-label="Volver a conversaciones" onClick={() => onSelect('')}><ArrowLeft size={19} /></button><span className="admin-chat-avatar">{selected.nickname.slice(0, 1).toUpperCase()}</span><div><strong ref={threadHeadingRef} tabIndex={-1}>{['https://gana777.vercel.app', 'https://gana777bet.online'].includes(selected.origin) ? `PRUEBA · ${selected.nickname}` : selected.nickname}</strong><small>{selected.completed_at ? 'Conversación completada' : ['https://gana777.vercel.app', 'https://gana777bet.online'].includes(selected.origin) ? 'Chat desde la página de prueba' : 'Chat de la plataforma externa'}</small></div></header>
          <div className="admin-chat-actions"><button type="button" className={selected.completed_at ? 'admin-chat-reopen' : 'admin-chat-complete'} disabled={demo || updating || sending || sendingEntry || linkBusy} onClick={() => void setCompleted(!selected.completed_at)}>{selected.completed_at ? <RotateCcw size={16} /> : <CircleCheck size={16} />}{updating ? 'Guardando…' : selected.completed_at ? 'Reabrir chat' : 'Marcar como completado'}</button></div>
          {canLink && <div className="external-chat-link"><div><Link2 size={18} /><strong>Vincular con un jugador</strong></div><p>Buscá el usuario que te indicó. Al vincularlo, este chat seguirá en la bandeja Chat junto con los mensajes de la app.</p><form onSubmit={event => void findPlayer(event)}><input aria-label="Usuario del jugador" value={linkUsername} onChange={event => { setLinkUsername(event.target.value); setLinkMatch(null); }} placeholder="Nombre de usuario exacto" autoCapitalize="none" spellCheck={false} maxLength={32} disabled={demo || linkBusy} /><button type="submit" disabled={demo || linkBusy || !linkUsername.trim()}>Buscar</button></form>{linkMatch && <div className="external-chat-link-match"><span><strong>@{linkMatch.username}</strong><small>{linkMatch.display_name || 'Jugador registrado'}</small></span><button type="button" disabled={demo || linkBusy} onClick={() => void linkPlayer()}>{linkBusy ? 'Vinculando…' : 'Vincular y abrir Chat'}</button></div>}</div>}
          <div className="admin-chat-messages" ref={log} role="log" aria-live="polite" aria-relevant="additions text">{hasMore && <button type="button" className="admin-chat-older" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? 'Cargando…' : 'Ver mensajes anteriores'}</button>}{loading && <p className="admin-chat-list-empty">Cargando conversación…</p>}{messages.filter(message => message.thread_id === selectedId).map(message => <div className={`message${message.sender_type === 'staff' ? ' mine' : ''}`} key={message.id}>{message.body !== 'Imagen adjunta' && <p className={isEntryBody(message.body) ? 'is-entry' : undefined}><ChatMessageText body={message.body} interactive={false} /></p>}{message.attachment_path && <ChatImage path={message.attachment_path} source="external" />}<small>{message.sender_type === 'staff' ? 'Soporte · ' : ''}{date(message.created_at)}</small></div>)}</div>
          {(error || notice) && <p className={`admin-chat-feedback${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</p>}
          {!selected.completed_at && <EntryLinkBar id="external-chat-entry-user" username={entryUser} onUsername={setEntryUser} disabled={demo || sending || sendingEntry || updating} onSend={() => void sendEntry()} />}
          {!selected.completed_at && <form className="admin-chat-composer" onSubmit={event => void send(event)}><label htmlFor="external-chat-message" className="sr-only">Responder a {selected.nickname}</label><textarea id="external-chat-message" name="message" placeholder="Escribí tu respuesta…" maxLength={2000} rows={2} required disabled={sending || sendingEntry || demo || updating} /><button type="submit" disabled={sending || sendingEntry || demo || updating} aria-label="Enviar respuesta"><Send size={18} /> Enviar</button><small>Enter para enviar · Shift + Enter para nueva línea</small></form>}
        </> : <div className="admin-chat-placeholder"><MessageCircle size={38} /><h2>Elegí una conversación</h2><p>Vas a ver el historial y responder desde acá.</p></div>}
      </section>
    </div>
  </section>;
}
