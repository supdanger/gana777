import { useEffect, useRef, type RefObject } from 'react';
import { ChevronRight } from 'lucide-react';
import { attentionWait } from './attention-status';
import { entryPreview } from './entry-link';

export type AttentionConversation = {
  id: string; name: string; preview: string; origin: string; timestamp: string;
  pending: boolean; completed: boolean; fromSupport: boolean;
};

export function useAttentionList(selectedId: string, onSelect: (id: string) => void) {
  const listRef = useRef<HTMLDivElement>(null);
  const threadHeadingRef = useRef<HTMLElement>(null);
  const lastSelection = useRef('');
  const scrollTop = useRef(0);
  const previous = useRef(selectedId);
  useEffect(() => {
    const returning = previous.current && !selectedId;
    previous.current = selectedId;
    if (selectedId) {
      const frame = requestAnimationFrame(() => threadHeadingRef.current?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(frame);
    }
    if (!returning) return;
    const frame = requestAnimationFrame(() => {
      if (!listRef.current) return;
      listRef.current.scrollTop = scrollTop.current;
      Array.from(listRef.current.querySelectorAll<HTMLButtonElement>('[data-conversation-id]'))
        .find(button => button.dataset.conversationId === lastSelection.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId]);
  const select = (id: string) => {
    lastSelection.current = id;
    scrollTop.current = listRef.current?.scrollTop ?? 0;
    onSelect(id);
  };
  return { listRef, select, threadHeadingRef };
}

export function AttentionConversationList({ rows, onSelect, listRef, empty, external = false }: {
  rows: AttentionConversation[]; onSelect: (id: string) => void;
  listRef: RefObject<HTMLDivElement | null>; empty: string; external?: boolean;
}) {
  const when = (value: string) => new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  return <div className="attention-list-body">
    <div className="attention-list-columns" aria-hidden="true"><span>{external ? 'Visitante' : 'Jugador'}</span><span>Último mensaje</span><span>Origen</span><span>Estado</span><span>Actividad</span><span /></div>
    <div className="admin-chat-list" ref={listRef}>
      {rows.length ? rows.map(row => <button type="button" key={row.id} className="admin-chat-item attention-conversation-row" data-conversation-id={row.id} aria-label={`Abrir conversación de ${row.name}`} onClick={() => onSelect(row.id)}>
        <span className="attention-list-person"><span className="admin-chat-avatar" aria-hidden="true">{row.name.slice(0, 1).toUpperCase()}</span><span><strong>{row.name}</strong><small>{external ? 'Visitante' : 'Jugador'}</small></span></span>
        <span className="admin-chat-preview">{row.fromSupport ? 'Soporte: ' : ''}{entryPreview(row.preview)}</span>
        <span className="attention-list-origin">{row.origin}</span>
        <span className={`attention-thread-status ${row.completed ? 'is-completed' : row.pending ? 'is-pending' : 'is-waiting'}`} title={row.pending ? attentionWait(row.timestamp) : undefined}>{row.completed ? 'Completada' : row.pending ? 'Por responder' : external ? 'Esperando al visitante' : 'Esperando al jugador'}</span>
        <time dateTime={row.timestamp}>{when(row.timestamp)}</time><ChevronRight size={16} aria-hidden="true" />
      </button>) : <p className="admin-chat-list-empty">{empty}</p>}
    </div>
  </div>;
}
