import type { Message, RequestRow } from './lib';

export function pendingRequestCount(requests: RequestRow[], kind: RequestRow['kind']): number {
  return requests.filter(request => request.kind === kind && request.status === 'pending').length;
}

export function pendingConversationCount(messages: Message[], adminId: string): number {
  const latestByUser = new Map<string, Message>();
  for (const message of messages) {
    const latest = latestByUser.get(message.user_id);
    if (!latest || Date.parse(message.created_at) >= Date.parse(latest.created_at)) latestByUser.set(message.user_id, message);
  }
  return [...latestByUser.values()].filter(message => message.sender_id !== adminId).length;
}
