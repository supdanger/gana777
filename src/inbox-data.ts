import { supabase } from './lib';
import { searchPattern, searchFilter } from './query-utils';

export type InboxFilter = 'pending' | 'waiting' | 'all' | 'completed';
export type InboxPagination = {
  search: string; filter: InboxFilter; page: number; total: number; all: number; pending: number; completed: number; loading: boolean;
  onQuery: (search: string, filter: InboxFilter) => void;
  onPage: (page: number) => void;
};
export type ChatSummary = { user_id: string; last_sender_id: string; completed_at: string | null };
export type ExternalSummary = { thread_id: string; last_sender_type: string; completed_at: string | null };
export const INBOX_PAGE_SIZE = 50;

export function inboxIds(rows: (ChatSummary | ExternalSummary)[], filter: InboxFilter): string[] {
  const matches = rows.filter(row => {
    if (filter === 'all') return true;
    if (filter === 'completed') return !!row.completed_at;
    if (row.completed_at) return false;
    const unanswered = 'user_id' in row ? row.last_sender_id === row.user_id : row.last_sender_type === 'visitor';
    return filter === 'pending' ? unanswered : !unanswered;
  });
  // Summaries arrive newest first. Reverse before pagination to prioritize older pending messages.
  if (filter === 'pending') matches.reverse();
  return matches.map(row => 'user_id' in row ? row.user_id : row.thread_id);
}

// The current database exposes pending as a comparison of two columns. Until
// the prepared SQL is applied, select exact candidate IDs from compact summaries
// and fetch the body/name fields only for the visible page.
export async function readInboxPage<T>(view: 'chat_inbox' | 'external_chat_inbox', ids: string[], search: string, page: number, signal: AbortSignal): Promise<{ rows: T[]; total: number }> {
  if (!supabase || !ids.length) return { rows: [], total: 0 };
  const idColumn = view === 'chat_inbox' ? 'user_id' : 'thread_id';
  const fields = view === 'chat_inbox' ? ['username', 'display_name', 'last_body'] : ['nickname', 'last_body'];
  const term = searchPattern(search);
  let matchedIds = ids;
  if (term) {
    const found = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const result = await supabase.from(view).select(idColumn).in(idColumn, ids.slice(i, i + 200))
        .or(searchFilter(fields, term)).abortSignal(signal);
      if (result.error) throw result.error;
      for (const row of result.data ?? []) found.add(String((row as unknown as Record<string, unknown>)[idColumn]));
    }
    matchedIds = ids.filter(id => found.has(id));
  }
  const selected = matchedIds.slice(page * INBOX_PAGE_SIZE, (page + 1) * INBOX_PAGE_SIZE);
  if (!selected.length) return { rows: [], total: matchedIds.length };
  const columns: string = view === 'chat_inbox'
    ? 'user_id,username,display_name,last_message_id,last_sender_id,last_body,last_created_at,completed_at,completed_by,last_source'
    : 'thread_id,nickname,origin,created_at,last_seen_at,completed_at,completed_by,last_message_id,last_sender_type,last_body,last_message_at';
  const result = await supabase.from(view).select(columns).in(idColumn, selected).abortSignal(signal);
  if (result.error) throw result.error;
  const byId = new Map((result.data ?? []).map(row => [String((row as unknown as Record<string, unknown>)[idColumn]), row]));
  return { rows: selected.flatMap(id => byId.has(id) ? [byId.get(id) as T] : []), total: matchedIds.length };
}
