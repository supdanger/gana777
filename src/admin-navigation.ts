import type { RequestRow } from './lib';

export function pendingRequestCount(requests: RequestRow[], kind: RequestRow['kind']): number {
  return requests.filter(request => request.kind === kind && request.status === 'pending').length;
}

type ChatLatest = { user_id: string; last_sender_id: string; completed_at?: string | null };

export function needsChatReply(row: ChatLatest): boolean {
  return !row.completed_at && row.last_sender_id === row.user_id;
}

export function pendingChatCount(rows: ChatLatest[]): number {
  return rows.filter(needsChatReply).length;
}
