import type { ReactNode } from 'react';
import { MessagesSquare, MessageCircle, UserRound } from 'lucide-react';
import { canOpenAdminPage, type StaffPermissions } from './staff';
import type { Page } from './user-shell';

export const attentionPages: Page[] = ['chat', 'external-chat', 'access-requests'];
export function AttentionCenter({ page, counts, permissions, superAdmin, navigate, children }: {
  page: Page; counts: { chat: number; externalChat: number; access: number };
  permissions: StaffPermissions; superAdmin: boolean; navigate: (page: Page) => void; children: ReactNode;
}) {
  const channels = [
    { page: 'chat' as Page, label: 'Jugadores', count: counts.chat, Icon: MessagesSquare },
    { page: 'external-chat' as Page, label: 'Chat externo', count: counts.externalChat, Icon: MessageCircle },
    { page: 'access-requests' as Page, label: 'Solicitudes de acceso', count: counts.access, Icon: UserRound },
  ].filter(item => canOpenAdminPage(item.page, permissions, superAdmin));
  const total = channels.reduce((sum, item) => sum + item.count, 0);
  return <section className="attention-center" aria-label="Centro de atención">
    <nav className="attention-channels" aria-label="Bandejas de atención">{channels.map(({ page: target, label, count, Icon }) => <button type="button" key={target} aria-current={page === target ? 'page' : undefined} onClick={() => navigate(target)}><Icon size={18} /><span>{label}</span><strong aria-label={`${count} pendientes`}>{count}</strong></button>)}<span className="attention-total"><strong>{total}</strong> pendientes</span></nav>
    <div className="attention-workspace">{children}</div>
  </section>;
}
