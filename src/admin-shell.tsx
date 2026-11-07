import { readDevicePreference, writeDevicePreference } from './device-preferences';
import './admin.css';
import './admin-system.css';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, Clock3, Disc, Gift, History, Landmark, Link2,
  LayoutDashboard, LogOut, Menu, MessagesSquare, MessageCircle, PhoneCall, UserCog,
  Users, X, PanelsTopLeft, UserRound, Layers3, BellRing, Palette, RefreshCw, Settings2,
  Search, ChevronDown,
} from 'lucide-react';
import { titles, type Page } from './user-shell';
import { normalizePanelTheme, panelThemes } from './admin-appearance';
import { canOpenAdminPage, type StaffPermissions } from './staff';

function PanelWordmark() {
  return <span className="admin-wordmark" aria-hidden="true">GANA777<span className="is-bet">bet</span><span className="is-role">PANEL</span></span>;
}
function PanelHomeBrand({ onHome }: { onHome: () => void }) {
  return <button type="button" className="admin-home-brand" onClick={onHome} aria-label="GANA777bet Panel. Ir a Inicio"><PanelWordmark /></button>;
}

type PendingCounts = { deposit: number; withdrawal: number; chat: number; externalChat: number; access: number };
type NavItem = { page: Page; Icon: typeof LayoutDashboard; count?: keyof PendingCounts; label?: string };
const groups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Resumen', items: [{ page: 'home', Icon: LayoutDashboard }] },
  { label: 'Operaciones', items: [
    { page: 'deposit', Icon: ArrowDownToLine, count: 'deposit' },
    { page: 'withdrawal', Icon: ArrowUpFromLine, count: 'withdrawal' },
    { page: 'history', Icon: History },
    { page: 'shifts', Icon: Clock3 },
  ] },
  { label: 'Atención', items: [
    { page: 'chat', Icon: MessagesSquare, count: 'chat' },
    { page: 'external-chat', Icon: MessageCircle, count: 'externalChat' },
    { page: 'access-requests', Icon: UserRound, count: 'access' },
  ] },
  { label: 'Jugadores', items: [
    { page: 'users', Icon: Users },
    { page: 'platform', Icon: Layers3 },
    { page: 'link', Icon: Link2 },
  ] },
  { label: 'Promociones', items: [
    { page: 'bonuses', Icon: Gift },
    { page: 'referrals', Icon: Gift },
    { page: 'wheel', Icon: Disc },
    { page: 'announcements', Icon: BellRing },
  ] },
  { label: 'Configuración', items: [
    { page: 'accounts', Icon: Landmark },
    { page: 'contacts', Icon: PhoneCall },
    { page: 'portal', Icon: PanelsTopLeft },
    { page: 'themes', Icon: Palette },
    { page: 'telegram', Icon: BellRing },
  ] },
  { label: 'Administración', items: [
    { page: 'cashiers', Icon: UserCog },
    { page: 'external-chat-admin', Icon: Settings2, label: 'Opciones de chat' },
  ] },
];
function sectionLabel(page: Page): string {
  return groups.find(group => group.items.some(item => item.page === page))?.label ?? 'Panel';
}

export function AdminShell({ page, counts, permissions, superAdmin, staffName, avatarUrl, busy, navigate, logout, onRefresh, children }: {
  page: Page; counts: PendingCounts; permissions: StaffPermissions; superAdmin: boolean;
  staffName: string; avatarUrl: string | null; busy: boolean; navigate: (page: Page) => void;
  logout: () => void; onRefresh: () => void; children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1024px)').matches);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [panelTheme, setPanelTheme] = useState(() => normalizePanelTheme(readDevicePreference('gana777:panel-theme')));
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setMenuOpen(false);
    setCollapsed(old => { const next = new Set(old); next.delete(sectionLabel(page)); return next; });
  }, [page]);
  useEffect(() => { writeDevicePreference('gana777:panel-theme', panelTheme); }, [panelTheme]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)');
    const resize = () => { setCompact(media.matches); if (!media.matches) setMenuOpen(false); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (!menuOpen || !compact) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    searchInput.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); menuButton.current?.focus(); }
      if (event.key !== 'Tab') return;
      const items = [...(sidebar.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, a[href]') ?? [])].filter(item => item.getClientRects().length > 0);
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', onKey); };
  }, [menuOpen, compact]);

  function closeMenu() { setMenuOpen(false); menuButton.current?.focus(); }
  function go(next: Page) {
    navigate(next); setMenuOpen(false); setSearch('');
    if (compact) requestAnimationFrame(() => document.getElementById('admin-main-content')?.focus({ preventScroll: true }));
  }
  const query = search.trim().toLocaleLowerCase('es');
  const visibleGroups = groups.map(group => ({ ...group, items: group.items.filter(item =>
    canOpenAdminPage(item.page, permissions, superAdmin) && (!query || `${item.label ?? titles[item.page]} ${group.label}`.toLocaleLowerCase('es').includes(query)),
  ) })).filter(group => group.items.length > 0);

  return <div className={`admin-shell admin-theme-${panelTheme}`}>
    <a className="admin-skip-link" href="#admin-main-content">Ir al contenido</a>
    <button className={`admin-menu-backdrop ${menuOpen ? 'visible' : ''}`} aria-label="Cerrar menú" aria-hidden={!menuOpen} tabIndex={menuOpen ? 0 : -1} onClick={closeMenu} />
    <aside ref={sidebar} id="admin-sidebar" className={`admin-sidebar ${menuOpen ? 'open' : ''}`} aria-label="Menú del panel" inert={compact && !menuOpen}>
      <div className="admin-sidebar-brand"><div><PanelHomeBrand onHome={() => go('home')} /><small className="admin-brand-caption">Centro de gestión</small></div><button className="admin-sidebar-close" aria-label="Cerrar menú" onClick={closeMenu}><X /></button></div>
      <label className="admin-menu-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Buscar sección del panel</span><input ref={searchInput} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar sección…" /></label>
      <nav className="admin-navigation" aria-label="Navegación principal">
        {visibleGroups.map((group, index) => {
          const expanded = !!query || !collapsed.has(group.label);
          const groupId = `admin-nav-${index}`;
          const total = group.items.reduce((sum, item) => sum + (item.count ? counts[item.count] : 0), 0);
          return <section className="admin-nav-group" key={group.label}>
            <h2><button type="button" className="admin-nav-group-toggle" aria-expanded={expanded} aria-controls={groupId} onClick={() => setCollapsed(old => { const next = new Set(old); if (next.has(group.label)) next.delete(group.label); else next.add(group.label); return next; })}><span>{group.label}</span>{!expanded && total > 0 && <small>{total}</small>}<ChevronDown size={12} className={expanded ? 'is-expanded' : ''} aria-hidden="true" /></button></h2>
            <div id={groupId} hidden={!expanded}>{group.items.map(({ page: itemPage, Icon, count, label }) => <button type="button" key={itemPage} className={page === itemPage ? 'active' : ''} aria-current={page === itemPage ? 'page' : undefined} onClick={() => go(itemPage)}>
              <Icon aria-hidden="true" /><span>{label ?? titles[itemPage]}</span>
              {count && counts[count] > 0 && <strong className="admin-nav-count has-pending" aria-label={`${counts[count]} pendientes`}>{counts[count]}</strong>}
            </button>)}</div>
          </section>;
        })}
        {!visibleGroups.length && <p className="admin-menu-empty">No hay secciones con ese nombre.</p>}
      </nav>
      <div className="admin-sidebar-footer">
        <label className="admin-theme-picker"><Palette size={15} aria-hidden="true" /><span>Apariencia</span><select value={panelTheme} onChange={event => setPanelTheme(normalizePanelTheme(event.target.value))} aria-label="Tema del panel">{panelThemes.map(theme => <option key={theme.key} value={theme.key}>{theme.label}</option>)}</select></label>
        <button className="admin-logout" disabled={busy} onClick={logout}><LogOut aria-hidden="true" /><span>Salir</span></button>
      </div>
    </aside>
    <section className="admin-workspace">
      <header className="admin-topbar">
        <button ref={menuButton} className="admin-menu-toggle" aria-label="Abrir menú" aria-expanded={menuOpen} aria-controls="admin-sidebar" onClick={() => setMenuOpen(true)}><Menu /></button>
        <div className="admin-breadcrumb"><PanelHomeBrand onHome={() => go('home')} /><strong>{page === 'external-chat-admin' ? 'Opciones de chat' : titles[page]}</strong></div>
        <button type="button" className="admin-refresh" disabled={busy} onClick={onRefresh} title="Actualizar los datos del panel"><RefreshCw size={15} aria-hidden="true" /><span>Actualizar</span></button>
        <div className="admin-staff-identity"><span className="admin-staff-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : staffName.slice(0, 1).toUpperCase()}</span><span><strong>{staffName}</strong><small>{superAdmin ? 'Superadministrador' : 'Cajero'}</small></span></div>
      </header>
      <main id="admin-main-content" tabIndex={-1} className={`app admin admin-content page-${page}`}>{children}</main>
    </section>
  </div>;
}
