import type { ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, MessagesSquare, UserRound } from 'lucide-react';
import { canOpenAdminPage, type StaffPermissions } from './staff';
import type { Page } from './user-shell';

type Counts = { deposit: number; withdrawal: number; chat: number; externalChat: number; access: number };
export function AdminOverview({ counts, permissions, superAdmin, navigate, note, bonuses, leaderboard }: {
  counts: Counts; permissions: StaffPermissions; superAdmin: boolean;
  navigate: (page: Page) => void; note: ReactNode; bonuses: ReactNode; leaderboard: ReactNode;
}) {
  const can = (page: Page) => canOpenAdminPage(page, permissions, superAdmin);
  const cards = [
    { page: 'deposit' as Page, title: 'Cargas pendientes', value: counts.deposit, Icon: ArrowDownToLine, visible: can('deposit') },
    { page: 'withdrawal' as Page, title: 'Retiros pendientes', value: counts.withdrawal, Icon: ArrowUpFromLine, visible: can('withdrawal') },
    { page: (can('chat') ? 'chat' : 'external-chat') as Page, title: 'Consultas por responder', value: (can('chat') ? counts.chat : 0) + (can('external-chat') ? counts.externalChat : 0), Icon: MessagesSquare, visible: can('chat') || can('external-chat') },
    { page: 'access-requests' as Page, title: 'Accesos solicitados', value: counts.access, Icon: UserRound, visible: can('access-requests') },
  ].filter(card => card.visible);
  const date = new Intl.DateTimeFormat('es-PY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Asuncion' }).format(new Date());
  return <section className="admin-overview" aria-labelledby="admin-overview-title">
    <div className="admin-overview-heading"><div><h1 id="admin-overview-title">Resumen operativo</h1><p>Pendientes y actividad de tus áreas de trabajo.</p></div><span className="admin-overview-date">{date}</span></div>
    {note}
    <div className="admin-overview-metrics">{cards.map(({ page, title, value, Icon }) => <button type="button" className={`overview-metric${value > 0 ? ' has-pending' : ''}`} key={page} onClick={() => navigate(page)} aria-label={`${title}: ${value}. Abrir sección`}>
      <span className="overview-metric-label">{title}</span><span className="overview-metric-icon"><Icon size={16} aria-hidden="true" /></span>
      <span className="overview-metric-footer"><strong className="overview-metric-value">{value}</strong><span className="overview-metric-action">Ver sección<ArrowUpRight size={13} aria-hidden="true" /></span></span>
    </button>)}</div>
    <div className="admin-overview-grid"><div>{bonuses}</div><div>{leaderboard}</div></div>
  </section>;
}
