import { appendQuickReply, chatQuickReplies } from './chat-quick-replies';
import { AttentionPlayerDialog } from './attention-player-dialog';
import { AttentionConversationList, useAttentionList } from './attention-conversation-list';
import type { InboxPagination } from './inbox-data';
import { InboxPager } from './inbox-pager';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, Check, CircleCheck, Copy, Images, Link2, MessageCircle, RotateCcw, Search, Send, Unlink2, X } from 'lucide-react';
import { useAdminRefreshVersion } from './admin-refresh';
import { date, supabase, type Message } from './lib';
import { ChatImage, removeChatImage, uploadChatImage, useChatImagePreview } from './chat-images';
import { needsChatReply, pendingChatCount } from './admin-navigation';
import { parseMessage, parseUuid, InputError } from '../supabase/functions/_shared/validation';
import { publicError } from './security';
import { ChatMessageText, EntryLinkBar, createEntryMessage } from './chat-entry';
import { entryPreview, isEntryBody } from './entry-link';

export type ChatInboxRow = {
  user_id: string; username: string | null; display_name: string | null;
  last_message_id: string; last_sender_id: string; last_body: string; last_created_at: string;
  completed_at: string | null; completed_by: string | null; last_source?: 'app' | 'external';
};
type Filter = 'pending' | 'waiting' | 'all' | 'completed';
const PAGE_SIZE = 50;


export function AdminChat({ inbox, selectedId, demo, canManageExternalLinks, onSelect, onChanged, pagination, canDeposit = false, canWithdrawal = false }: {
  pagination?: InboxPagination; canDeposit?: boolean; canWithdrawal?: boolean;
  inbox: ChatInboxRow[]; selectedId: string; demo: boolean; canManageExternalLinks: boolean;
  onSelect: (id: string) => void; onChanged: () => void;
}) {
  const [showPlayerData, setShowPlayerData] = useState(false);
  useEffect(() => setShowPlayerData(false), [selectedId]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const composer = useRef<HTMLTextAreaElement>(null);
  const sendLock = useRef(false);
  const draft = drafts[selectedId] ?? '';
  const { listRef, select, threadHeadingRef } = useAttentionList(selectedId, onSelect);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState(pagination?.search ?? '');
  const [filter, setFilter] = useState<Filter>(pagination?.filter ?? 'all');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const imagePreview = useChatImagePreview(image);
  const imageInput = useRef<HTMLInputElement>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [externalLinks, setExternalLinks] = useState<{ id: string; nickname: string }[]>([]);
  const [unlinking, setUnlinking] = useState(false);
  const [entryUser, setEntryUser] = useState('');
  const [sendingEntry, setSendingEntry] = useState(false);
  const messageLog = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const activeThreadId = useRef(selectedId);
  const externalLinksRef = useRef(externalLinks);
  activeThreadId.current = selectedId;
  externalLinksRef.current = externalLinks;
  const selectedSnapshot = useRef<ChatInboxRow | undefined>(undefined);
  const currentSelected = inbox.find(row => row.user_id === selectedId);
  const [selectedFallback, setSelectedFallback] = useState<ChatInboxRow | undefined>(undefined);
  if (currentSelected && (selectedSnapshot.current?.user_id !== selectedId || currentSelected.last_created_at >= selectedSnapshot.current.last_created_at)) selectedSnapshot.current = currentSelected;
  if (!currentSelected && selectedFallback?.user_id === selectedId && selectedSnapshot.current?.user_id !== selectedId) selectedSnapshot.current = selectedFallback;
  const latestVisibleMessage = messages.at(-1);
  if (latestVisibleMessage?.user_id === selectedId && selectedSnapshot.current?.user_id === selectedId && latestVisibleMessage.created_at >= selectedSnapshot.current.last_created_at) {
    selectedSnapshot.current = { ...selectedSnapshot.current, last_message_id: latestVisibleMessage.id, last_created_at: latestVisibleMessage.created_at, last_body: latestVisibleMessage.body, last_sender_id: latestVisibleMessage.sender_id };
  }
  const selected = selectedSnapshot.current?.user_id === selectedId ? selectedSnapshot.current : undefined;
  useEffect(() => {
    if (!selectedId || demo || !supabase || currentSelected || selectedSnapshot.current?.user_id === selectedId) return;
    const controller = new AbortController();
    void supabase.from('chat_inbox').select('*').eq('user_id', selectedId).abortSignal(controller.signal).maybeSingle().then(({ data, error }) => {
      if (!controller.signal.aborted && !error && data) setSelectedFallback(data as ChatInboxRow);
    });
    return () => controller.abort();
  }, [selectedId, demo, inbox]);
  useEffect(() => { if (selected?.username) setEntryUser(selected.username); }, [selectedId, selected?.username]);
  const selectedSubtitle = selected ? [
    selected.completed_at ? 'Conversación completada' : '',
    selected.display_name && selected.display_name !== selected.username ? selected.display_name : '',
  ].filter(Boolean).join(' · ') : '';
  const pending = pagination?.pending ?? pendingChatCount(inbox);
  const completed = pagination?.completed ?? inbox.filter(row => !!row.completed_at).length;
  const title = (row: ChatInboxRow) => row.username || row.display_name || `Usuario ${row.user_id.slice(0, 8)}`;
  const adminRefresh = useAdminRefreshVersion();

  useEffect(() => {
    if (!selectedId || demo) { setMessages([]); return; }
    stickToBottom.current = true;
    setMessages([]); setLoadingOlder(false); setHasMore(false); setError(''); setNotice(''); setCopied(false); setImage(null);
    setEntryUser(inbox.find(row => row.user_id === selectedId)?.username ?? '');
    if (imageInput.current) imageInput.current.value = '';
  }, [selectedId, demo]);
  useEffect(() => {
    if (!selectedId || demo || !supabase) return;
    const db = supabase;
    let alive = true;
    setLoading(true);
    const loadLatest = () => void db.from('unified_chat_messages').select('id,user_id,sender_id,body,attachment_path,created_at,source,external_thread_id')
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
    loadLatest();
    return () => { alive = false; };
  }, [selectedId, demo, adminRefresh]);

  useEffect(() => {
    if (!selectedId || demo || !supabase) { setExternalLinks([]); return; }
    const db = supabase;
    let alive = true;
    const refreshLinks = () => void db.from('external_chat_threads').select('id,nickname').eq('linked_user_id', selectedId)
      .then(({ data }) => { if (alive) setExternalLinks((data ?? []) as { id: string; nickname: string }[]); });
    refreshLinks();
    return () => { alive = false; };
  }, [selectedId, demo, adminRefresh]);

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
    const result = await supabase.from('unified_chat_messages').select('id,user_id,sender_id,body,attachment_path,created_at,source,external_thread_id')
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
      if (!sending && !demo && (event.currentTarget.value.trim() || image)) event.currentTarget.form?.requestSubmit();
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || demo || sendLock.current || sending || sendingEntry || !selectedId || selected?.completed_at || updatingStatus) return;
    const form = event.currentTarget;
    const sentDraft = draft;
    sendLock.current = true;
    setSending(true); setError(''); setNotice('');
    try {
      const raw = String(new FormData(form).get('message') ?? '').trim();
      if (!raw && !image) throw new Error('Escribí un mensaje o adjuntá una imagen.');
      const body = parseMessage(raw || 'Imagen adjunta');
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) throw new Error('Tu sesión venció. Volvé a ingresar.');
      const attachment_path = image ? await uploadChatImage(parseUuid(selectedId), image) : null;
      let data: Message;
      try {
        const result = await supabase.from('messages')
          .insert({ user_id: parseUuid(selectedId), sender_id: session.user.id, body, attachment_path })
          .select('id,user_id,sender_id,body,attachment_path,created_at').single();
        if (result.error) throw result.error;
        data = result.data as Message;
      } catch (cause) {
        if (attachment_path) await removeChatImage(attachment_path);
        throw cause;
      }
      if (activeThreadId.current === selectedId) {
        setMessages(old => old.some(item => item.id === data.id) ? old : [...old, data as Message]);
        form.reset(); setImage(null);
        if (imageInput.current) imageInput.current.value = '';
      }
      setDrafts(old => {
        if ((old[selectedId] ?? '') !== sentDraft) return old;
        const next = { ...old }; delete next[selectedId]; return next;
      });
      onChanged();
      const { error: pushError } = await supabase.functions.invoke('send-user-push', { body: { message_id: data.id } });
      if (pushError && activeThreadId.current === selectedId) setNotice('Respuesta enviada. El usuario la verá en el chat y en sus avisos; el push no pudo salir.');
    } catch (cause) { if (activeThreadId.current === selectedId) setError(publicError(cause)); }
    finally { sendLock.current = false; setSending(false); }
  }

  function insertQuickReply(id: string) {
    const reply = chatQuickReplies.find(item => item.id === id);
    if (!reply) return;
    const next = appendQuickReply(draft, reply.body);
    if (next === null) { setError('La respuesta supera los 2000 caracteres. Acortá el borrador antes de insertarla.'); return; }
    setError('');
    setDrafts(old => ({ ...old, [selectedId]: next }));
    composer.current?.focus();
  }

  async function sendEntry() {
    if (!supabase || demo || sending || sendingEntry || !selectedId || selected?.completed_at) return;
    const userId = selectedId;
    setSendingEntry(true); setError(''); setNotice('');
    try {
      const body = await createEntryMessage(entryUser);
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) throw new InputError('Tu sesión venció. Volvé a ingresar.');
      const result = await supabase.from('messages')
        .insert({ user_id: parseUuid(userId), sender_id: session.user.id, body, attachment_path: null })
        .select('id,user_id,sender_id,body,attachment_path,created_at').single();
      if (result.error || !result.data) throw new InputError('No pudimos mandar el botón Entrar. Intentá nuevamente.');
      if (activeThreadId.current === userId) {
        setMessages(old => old.some(item => item.id === result.data.id) ? old : [...old, result.data as Message]);
        setNotice('Listo. Le mandamos el botón Entrar.');
      }
      onChanged();
      const { error: pushError } = await supabase.functions.invoke('send-user-push', { body: { message_id: result.data.id } });
      if (pushError && activeThreadId.current === userId) setNotice('Le mandamos el botón Entrar. El aviso push no pudo salir.');
    } catch (cause) { if (activeThreadId.current === userId) setError(publicError(cause)); }
    finally { setSendingEntry(false); }
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

  async function unlinkExternal(threadId: string, nickname: string) {
    if (!supabase || demo || unlinking || !canManageExternalLinks) return;
    if (!window.confirm(`¿Desvincular el chat externo ${nickname} de este jugador? Los mensajes nuevos volverán a Chat externo.`)) return;
    setUnlinking(true); setError(''); setNotice('');
    const { error: unlinkError } = await supabase.rpc('unlink_external_chat', { p_thread_id: threadId });
    setUnlinking(false);
    if (unlinkError) { setError('No pudimos desvincular este chat. Intentá de nuevo.'); return; }
    setExternalLinks(old => old.filter(item => item.id !== threadId));
    setMessages(old => old.filter(item => item.external_thread_id !== threadId));
    setNotice('Chat externo desvinculado. Ya aparece en su bandeja original.');
    onChanged();
  }

  const onQueryRef = useRef(pagination?.onQuery);
  onQueryRef.current = pagination?.onQuery;
  useEffect(() => { onQueryRef.current?.(search, filter); }, [search, filter]);
  const query = search.trim().toLocaleLowerCase('es');
  const visible = pagination ? inbox : inbox.filter(row => {
    if (filter === 'pending' && !needsChatReply(row)) return false;
    if (filter === 'completed' && !row.completed_at) return false;
    if (filter === 'waiting' && (row.completed_at || needsChatReply(row))) return false;
    if (!query) return true;
    return [row.username, row.display_name, entryPreview(row.last_body), row.user_id]
      .some(value => value?.toLocaleLowerCase('es').includes(query));
  }).sort((a, b) => filter === 'pending' ? a.last_created_at.localeCompare(b.last_created_at) || a.last_message_id.localeCompare(b.last_message_id) : 0);

  return <section className={`admin-chat regular-chat-admin-view attention-list-view${selectedId ? ' has-selection' : ''}`} aria-label="Bandeja de conversaciones">
    <div className="admin-chat-heading"><div><h2>Chats de jugadores</h2><p>Respondé las consultas de los jugadores desde una sola bandeja.</p></div><span>{pending} por responder</span></div>
    {selectedId && <div className="attention-thread-toolbar"><button type="button" className="attention-return" onClick={() => onSelect('')}><ArrowLeft size={17} />Volver a conversaciones</button>{selected && <button type="button" onClick={() => setShowPlayerData(true)}>Ver datos del jugador</button>}</div>}
    <div className="admin-chat-layout">
      <aside hidden={!!selectedId} className="admin-chat-inbox" aria-label="Conversaciones">
        <div className="admin-chat-inbox-header"><strong>Conversaciones</strong><small>{pagination?.all ?? inbox.length} en total</small></div>
        <label className="admin-chat-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Buscar conversación</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Usuario o último mensaje" /></label>
        <div className="admin-chat-filters" role="group" aria-label="Filtrar conversaciones">
          <button type="button" className={filter === 'pending' ? 'active' : ''} aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')}>Por responder <span>{pending}</span></button>
          <button type="button" className={filter === 'waiting' ? 'active' : ''} aria-pressed={filter === 'waiting'} onClick={() => setFilter('waiting')}>Esperando al jugador</button>
          <button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todas</button>
          <button type="button" className={filter === 'completed' ? 'active' : ''} aria-pressed={filter === 'completed'} onClick={() => setFilter('completed')}>Completadas <span>{completed}</span></button>
        </div>
        <AttentionConversationList listRef={listRef} onSelect={select} rows={visible.map(row => ({ id: row.user_id, name: title(row), preview: row.last_body, origin: row.last_source === 'external' ? 'Burbuja' : 'Portal', timestamp: row.last_created_at, pending: needsChatReply(row), completed: !!row.completed_at, fromSupport: row.last_sender_id !== row.user_id }))} empty={query ? 'No encontramos conversaciones con esa búsqueda.' : filter === 'pending' ? 'No hay consultas por responder.' : filter === 'waiting' ? 'No hay conversaciones esperando al jugador.' : filter === 'completed' ? 'No hay conversaciones completadas.' : 'Todavía no hay conversaciones.'} />
        <InboxPager pagination={pagination} />
      </aside>
      <section hidden={!selectedId} className="admin-chat-thread" aria-label={selected ? `Conversación con ${title(selected)}` : 'Seleccioná una conversación'}>
        {selected ? <>
          <header className="admin-chat-thread-header"><button type="button" className="admin-chat-back" aria-label="Volver a conversaciones" onClick={() => onSelect('')}><ArrowLeft size={19} /></button><span className="admin-chat-avatar">{title(selected).slice(0, 1).toUpperCase()}</span><div><strong ref={threadHeadingRef} tabIndex={-1}>{title(selected)}</strong>{selectedSubtitle && <small>{selectedSubtitle}</small>}</div>{selected.username && <button type="button" className="admin-chat-copy" onClick={() => void copyUsername()} aria-label="Copiar nombre de usuario">{copied ? <Check size={16} /> : <Copy size={16} />}<span>{copied ? 'Copiado' : 'Copiar usuario'}</span></button>}</header>
          <div className="admin-chat-actions"><button type="button" className={selected.completed_at ? 'admin-chat-reopen' : 'admin-chat-complete'} disabled={demo || updatingStatus || sending || sendingEntry} onClick={() => void updateStatus(!selected.completed_at)}>{selected.completed_at ? <RotateCcw size={16} /> : <CircleCheck size={16} />}{updatingStatus ? 'Guardando…' : selected.completed_at ? 'Reabrir chat' : 'Marcar como completado'}</button></div>
          {!!externalLinks.length && <div className="admin-chat-linked"><div><Link2 size={16} /><strong>Burbuja vinculada</strong></div>{externalLinks.map(link => <span key={link.id}><small>{link.nickname}</small>{canManageExternalLinks && <button type="button" disabled={demo || unlinking} onClick={() => void unlinkExternal(link.id, link.nickname)}><Unlink2 size={14} /> Desvincular</button>}</span>)}</div>}
          <div className="admin-chat-messages" ref={messageLog} role="log" aria-live="polite" aria-relevant="additions text" onScroll={event => { const element = event.currentTarget; stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; }}>{hasMore && <button type="button" className="admin-chat-older" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? 'Cargando…' : 'Ver mensajes anteriores'}</button>}{loading && <p className="admin-chat-list-empty">Cargando conversación…</p>}{messages.filter(message => message.user_id === selectedId).map(message => <div className={`message ${message.sender_id !== message.user_id ? 'mine' : ''}`} key={message.id}><p className={isEntryBody(message.body) ? 'is-entry' : undefined}>{message.body === 'Imagen adjunta' && message.attachment_path ? '' : <ChatMessageText body={message.body} interactive={false} />}{message.attachment_path && <ChatImage path={message.attachment_path} source={message.source} />}</p><small>{message.source === 'external' ? 'Burbuja · ' : ''}{message.sender_id !== message.user_id ? 'Soporte · ' : ''}{date(message.created_at)}</small></div>)}</div>
          {(error || notice) && <p className={`admin-chat-feedback${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</p>}
          {!selected.completed_at && <EntryLinkBar id="admin-chat-entry-user" username={entryUser} onUsername={setEntryUser} disabled={demo || sending || sendingEntry || updatingStatus} onSend={() => void sendEntry()} />}
          {!selected.completed_at && <form className="admin-chat-composer" onSubmit={event => void send(event)}><label htmlFor="admin-chat-message" className="sr-only">Responder a {title(selected)}</label><div className="chat-quick-replies"><label htmlFor="player-chat-quick-reply">Respuestas rápidas</label><select id="player-chat-quick-reply" value="" disabled={sending || sendingEntry || updatingStatus || demo} onChange={event => insertQuickReply(event.target.value)}><option value="">Elegir una respuesta…</option>{chatQuickReplies.map(reply => <option key={reply.id} value={reply.id}>{reply.label}</option>)}</select><small>Se agrega al borrador. Podés editarla antes de enviar.</small></div>{imagePreview && <div className="chat-image-preview"><img src={imagePreview} alt="Imagen seleccionada" /><span>{image?.name}</span><button type="button" aria-label="Quitar imagen" onClick={() => { setImage(null); if (imageInput.current) imageInput.current.value = ''; }}><X size={16} /></button></div>}<textarea ref={composer} value={draft} onChange={event => setDrafts(old => ({ ...old, [selectedId]: event.target.value }))} id="admin-chat-message" name="message" placeholder="Escribí tu respuesta…" maxLength={2000} rows={2} required={!image} disabled={sending || sendingEntry || demo || updatingStatus} onKeyDown={onComposerKeyDown} /><input ref={imageInput} className="chat-file-input" type="file" accept="image/*" disabled={sending || sendingEntry || demo || updatingStatus} onChange={event => setImage(event.target.files?.[0] ?? null)} /><button type="button" className="admin-chat-image-button" aria-label="Adjuntar imagen de la galería" disabled={sending || sendingEntry || demo || updatingStatus} onClick={() => imageInput.current?.click()}><Images size={18} /></button><button type="submit" disabled={sending || sendingEntry || demo || updatingStatus} aria-label="Enviar respuesta"><Send size={18} /> Enviar</button><small>{draft.length}/2000 · Enter para enviar · Shift + Enter para nueva línea</small></form>}
        </> : <div className="admin-chat-placeholder"><MessageCircle size={38} /><h2>Elegí una conversación</h2><p>Vas a ver el historial y responder desde acá.</p></div>}
      </section>

    </div>
    {selected && showPlayerData && <AttentionPlayerDialog key={`${selected.user_id}:${canDeposit}:${canWithdrawal}`} userId={selected.user_id} username={title(selected)} demo={demo} canDeposit={canDeposit} canWithdrawal={canWithdrawal} onClose={() => setShowPlayerData(false)} />}
  </section>;
}
