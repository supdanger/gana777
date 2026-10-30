import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, Clock3, Disc, Gift, History, Landmark,
  LayoutDashboard, LogOut, Menu, MessagesSquare, MessageCircle, PhoneCall, UserCog, Users, X, PanelsTopLeft, UserRound, Layers3, BellRing, Palette, Settings2,
} from 'lucide-react';
import { Brand, titles, type Page } from './user-views';
import { AdminPageGuide } from './admin-guides';
import { canOpenAdminPage, type StaffPermissions } from './staff';

type PendingCounts = { deposit: number; withdrawal: number; chat: number; externalChat: number; access: number };

const groups: Array<{ label: string; items: Array<{ page: Page; Icon: typeof LayoutDashboard; count?: keyof PendingCounts }> }> = [
  { label: 'Principal', items: [{ page: 'home', Icon: LayoutDashboard }] },
  { label: 'Operaciones', items: [
    { page: 'deposit', Icon: ArrowDownToLine, count: 'deposit' },
    { page: 'withdrawal', Icon: ArrowUpFromLine, count: 'withdrawal' },
    { page: 'chat', Icon: MessagesSquare, count: 'chat' },
    { page: 'external-chat', Icon: MessageCircle, count: 'externalChat' },
    { page: 'announcements', Icon: BellRing },
    { page: 'access-requests', Icon: UserRound, count: 'access' },
    { page: 'users', Icon: Users },
    { page: 'platform', Icon: Layers3 },
    { page: 'shifts', Icon: Clock3 },
    { page: 'referrals', Icon: Gift },
    { page: 'wheel', Icon: Disc },
    { page: 'history', Icon: History },
  ] },
  { label: 'Configuración', items: [
    { page: 'contacts', Icon: PhoneCall },
    { page: 'portal', Icon: PanelsTopLeft },
    { page: 'themes', Icon: Palette },
    { page: 'bonuses', Icon: Gift },
    { page: 'accounts', Icon: Landmark },
    { page: 'telegram', Icon: BellRing },
  ] },
  { label: 'Administración', items: [{ page: 'cashiers', Icon: UserCog }, { page: 'external-chat-admin', Icon: Settings2 }] },
];

function sectionLabel(page: Page): string {
  return groups.find(group => group.items.some(item => item.page === page))?.label ?? 'Panel';
}

export function AdminShell({ page, counts, permissions, superAdmin, staffName, avatarUrl, busy, navigate, logout, children }: {
  page: Page;
  counts: PendingCounts;
  permissions: StaffPermissions;
  superAdmin: boolean;
  staffName: string;
  avatarUrl: string | null;
  busy: boolean;
  navigate: (page: Page) => void;
  logout: () => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [page]);

  function go(next: Page) {
    navigate(next);
    setMenuOpen(false);
  }

  return <div className="admin-shell">
    <button className={`admin-menu-backdrop ${menuOpen ? 'visible' : ''}`} aria-label="Cerrar menú" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)} />
    <aside className={`admin-sidebar ${menuOpen ? 'open' : ''}`} aria-label="Menú del panel">
      <div className="admin-sidebar-brand"><Brand panel /><button className="admin-sidebar-close" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}><X /></button></div>
      <nav className="admin-navigation" aria-label="Navegación principal">
        {groups.map(group => {
          const items = group.items.filter(item => canOpenAdminPage(item.page, permissions, superAdmin));
          if (!items.length) return null;
          return <section className="admin-nav-group" key={group.label}>
          <h2>{group.label}</h2>
          {items.map(({ page: itemPage, Icon, count }) => <button
            key={itemPage}
            className={page === itemPage ? 'active' : ''}
            aria-current={page === itemPage ? 'page' : undefined}
            onClick={() => go(itemPage)}
          >
            <Icon aria-hidden="true" />
            <span>{titles[itemPage]}</span>
            {count && counts[count] > 0 && <strong className="admin-nav-count has-pending" aria-label={`${counts[count]} pendientes`}>{counts[count]}</strong>}
          </button>)}
        </section>})}
      </nav>
      <button className="admin-logout" disabled={busy} onClick={logout}><LogOut aria-hidden="true" /><span>Salir</span></button>
    </aside>
    <section className="admin-workspace">
      <header className="admin-topbar">
        <button className="admin-menu-toggle" aria-label="Abrir menú" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu /></button>
        <div><small>{sectionLabel(page)}</small><strong>{titles[page]}</strong></div>
        <div className="admin-staff-identity">
          <span className="admin-staff-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : staffName.slice(0, 1).toUpperCase()}</span>
          <span><strong>{staffName}</strong><small>{superAdmin ? 'Superadministrador' : 'Cajero'}</small></span>
        </div>
      </header>
      <main className={`app admin admin-content page-${page}`}><AdminPageGuide key={page} page={page} />{children}</main>
    </section>
  </div>;
}
