import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Activity, Ban, ChevronRight, ExternalLink, KeyRound, Layers3, Link2, RefreshCw, Search, ShieldCheck, UserRound } from 'lucide-react';
import { InputError } from '../supabase/functions/_shared/validation';
import { invokeAdminPlayerAccess } from './admin-player-access-api';
import { date, money, supabase } from './lib';
import { safeHttpsLink } from './security';

type Player = { user_id: string; username: string | null; created_at: string };
type Principal = { slot: number; phone: string; active: boolean };
type Detail = {
  profile: Player & { display_name: string; phone: string | null; external_user_id: string | null; whatsapp_principal_slot: number | null; updated_at: string };
  access_request: { id: string; referral_code: string | null; created_at: string; origin_ip: string | null; origin_user_agent: string | null } | null;
  casino_link: { url: string; updated_at: string } | null;
  referrer: { name: string } | null;
  principal: { phone: string; active: boolean } | null;
  auth: { last_sign_in_at: string | null; banned_until: string | null };
  stats: { deposits: number; approved_deposits: number; approved_deposit_amount: number; withdrawals: number; approved_withdrawals: number; approved_withdrawal_amount: number; last_activity_at: string | null };
  operations: Array<{ id: string; kind: 'deposit' | 'withdrawal'; status: 'pending' | 'approved' | 'rejected'; amount: number; created_at: string }>;
  same_ip_accounts?: Array<{ username: string }>;
  ip_attempts?: Array<{ id: string; username: string; created_at: string }>;
};
const statusName = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };
const pageSize = 20;
type DetailTab = 'summary' | 'data' | 'access' | 'activity';
const detailTabs: { id: DetailTab; label: string }[] = [
  { id: 'summary', label: 'Resumen' },
  { id: 'access', label: 'Acceso' },
  { id: 'data', label: 'Datos' },
  { id: 'activity', label: 'Actividad' },
];

export function PlatformAdmin({ demo, busy, action }: { demo: boolean; busy: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState('');
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState<DetailTab>('summary');
  const listVersion = useRef(0);
  const selectedIdRef = useRef('');
  selectedIdRef.current = selectedId;

  async function load(reset: boolean, term = search) {
    if (demo || !supabase) { setLoading(false); return; }
    const clean = term.trim();
    if (!clean) {
      listVersion.current += 1;
      setPlayers([]);
      setTotal(0);
      setError('');
      setLoading(false);
      return;
    }
    const version = ++listVersion.current;
    setLoading(true);
    let request = supabase.from('user_profiles').select('user_id,username,created_at', { count: 'exact' })
      .eq('account_origin', 'platform').order('created_at', { ascending: false }).order('user_id', { ascending: false })
      .range(reset ? 0 : players.length, (reset ? 0 : players.length) + pageSize - 1);
    request = request.ilike('username', `%${clean}%`);
    const result = await request;
    if (version !== listVersion.current) return;
    setLoading(false);
    if (result.error) { setError('No pudimos cargar las cuentas Platform. Revisá la conexión y las migraciones.'); return; }
    setError('');
    const rows = (result.data ?? []) as Player[];
    setPlayers(current => reset ? rows : [...current, ...rows]);
    setTotal(result.count ?? rows.length);
  }
  async function loadDetail(userId: string) {
    if (demo) return;
    setDetailError('');
    try {
      const result = await invokeAdminPlayerAccess({ action: 'admin-platform-detail', user_id: userId }) as Detail;
      if (selectedIdRef.current !== userId) return;
      setDetail(result); setLinkInput(result.casino_link?.url ?? '');
    } catch (failure) { if (selectedIdRef.current === userId) setDetailError(failure instanceof Error ? failure.message : 'No pudimos cargar la ficha.'); }
  }
  useEffect(() => { void load(true); }, [demo, search]);
  useEffect(() => {
    if (demo || !supabase) return;
    void supabase.from('whatsapp_principals').select('slot,phone,active').order('slot').then(({ data }) => setPrincipals((data ?? []) as Principal[]));
  }, [demo]);
  useEffect(() => { setDetail(null); setDetailError(''); setNotice(''); setPassword(''); setLinkInput(''); setTab('summary'); if (selectedId) void loadDetail(selectedId); }, [selectedId, demo]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return;
    const form = new FormData(event.currentTarget);
    await action(async () => {
      await invokeAdminPlayerAccess({ action: 'admin-platform-update', user_id: detail.profile.user_id,
        display_name: form.get('display_name'), phone: form.get('phone'), external_user_id: form.get('external_user_id'),
        whatsapp_principal_slot: form.get('whatsapp_principal_slot') });
      await loadDetail(detail.profile.user_id);
      setNotice('Datos guardados.');
    });
  }
  async function saveLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return;
    const link = safeHttpsLink(linkInput.trim());
    if (!link) { setDetailError('Ingresá una URL personal HTTPS válida.'); return; }
    await action(async () => { await invokeAdminPlayerAccess({ action: 'admin-platform-link', user_id: detail.profile.user_id, casino_url: link }); await loadDetail(detail.profile.user_id); setNotice('Enlace personal guardado.'); });
  }
  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return;
    if (!detail.access_request?.id || !detail.casino_link?.url) { setDetailError('Primero guardá el enlace personal del jugador.'); return; }
    if (!window.confirm(`¿Cambiar la contraseña de @${detail.profile.username} y enviarla por el chat del portal?`)) return;
    await action(async () => {
      if (password.length < 8 || password.length > 72) throw new InputError('La contraseña debe tener entre 8 y 72 caracteres.');
      await invokeAdminPlayerAccess({ action: 'admin-configure', request_id: detail.access_request!.id, password, casino_url: detail.casino_link!.url });
      setPassword(''); await loadDetail(detail.profile.user_id); setNotice('Contraseña actualizada y enviada al chat del portal.');
    });
  }
  async function changeSuspension() {
    if (!detail) return;
    const suspended = Boolean(detail.auth.banned_until && new Date(detail.auth.banned_until) > new Date());
    if (!window.confirm(suspended ? `¿Reactivar el acceso de @${detail.profile.username}?` : `¿Suspender el acceso de @${detail.profile.username}?`)) return;
    await action(async () => { await invokeAdminPlayerAccess({ action: 'admin-platform-ban', user_id: detail.profile.user_id, suspend: !suspended }); await loadDetail(detail.profile.user_id); setNotice(suspended ? 'Acceso reactivado.' : 'Acceso suspendido.'); });
  }

  const suspended = Boolean(detail?.auth.banned_until && new Date(detail.auth.banned_until) > new Date());
  const link = safeHttpsLink(detail?.casino_link?.url);
  const sameIp = detail?.same_ip_accounts ?? [];
  const ipAttempts = detail?.ip_attempts ?? [];
  return <section className="platform-admin" aria-labelledby="platform-title">
    <div className="account-heading"><div><h1 id="platform-title">Platform</h1><p>Consultá la cuenta y gestioná sus datos, acceso y actividad desde una sola ficha.</p></div>{search ? <strong>{total} {total === 1 ? 'cuenta' : 'cuentas'}</strong> : null}</div>
    <div className="platform-admin-layout">
      <aside className="platform-admin-panel">
        <div className="platform-admin-toolbar"><span><Layers3 size={18} /> Usuarios {search ? <small>{total}</small> : null}</span><button type="button" disabled={loading || demo || (!search && !selectedId)} onClick={() => { if (search) void load(true); if (selectedId) void loadDetail(selectedId); }} aria-label="Actualizar usuarios y ficha"><RefreshCw size={15} /></button></div>
        <form className="platform-admin-search" role="search" onSubmit={event => { event.preventDefault(); setSelectedId(''); setSearch(query.trim().replace(/^@/, '')); }}><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por usuario" maxLength={32} aria-label="Buscar usuario Platform" /><button type="submit">Buscar</button></form>
        {search && <p className="platform-admin-hint">Resultados para “{search}”</p>}
        {error && <p className="platform-admin-empty" role="alert">{error}</p>}
        {!error && !loading && !players.length && <p className="platform-admin-empty">{search ? 'No encontramos cuentas Platform.' : 'Escribí un usuario y tocá Buscar.'}</p>}
        <div className="platform-admin-list">{players.map(player => <button type="button" key={player.user_id} className={`platform-admin-row${selectedId === player.user_id ? ' active' : ''}`} aria-current={selectedId === player.user_id ? 'true' : undefined} onClick={() => setSelectedId(player.user_id)}><span className="platform-admin-avatar"><UserRound size={19} /></span><span className="platform-admin-row-copy"><strong>{player.username ? `@${player.username}` : 'Usuario sin nombre'}</strong><small>Alta {date(player.created_at)}</small></span><ChevronRight size={16} className="platform-admin-row-arrow" aria-hidden="true" /></button>)}</div>
        {loading && <p className="platform-admin-empty">Cargando cuentas…</p>}
        {!loading && players.length < total && <button type="button" className="platform-admin-more" onClick={() => void load(false)}>Mostrar más</button>}
      </aside>
      <div className="platform-admin-detail">
        {!selectedId ? <div className="platform-admin-placeholder"><UserRound size={32} /><h2>Buscá un usuario</h2><p>Escribí el nombre y tocá Buscar. Acá aparece la ficha.</p></div> : detailError && !detail ? <p className="platform-admin-empty" role="alert">{detailError}</p> : !detail ? <p className="platform-admin-empty">Cargando ficha…</p> : <>
          <header className="platform-detail-header"><span className="platform-detail-avatar"><UserRound size={22} /></span><div><span className="platform-detail-eyebrow">Ficha del jugador</span><h2>@{detail.profile.username}</h2><p>{detail.profile.display_name} · Alta {date(detail.profile.created_at)}</p></div><span className={`platform-admin-status${suspended ? ' is-suspended' : ''}`}>{suspended ? 'Suspendida' : 'Activa'}</span></header>
          {ipAttempts.length > 0 && <p className="platform-ip-alert" role="status">{`Este celular intentó pedir ${ipAttempts.length === 1 ? 'otra cuenta' : 'otras cuentas'}: ${ipAttempts.map(item => `@${item.username}`).join(', ')}.`}</p>}
          {sameIp.length > 0 && <p className="platform-detail-note">{`Otras cuentas pidieron acceso desde la misma red: ${sameIp.map(item => `@${item.username}`).join(', ')}. Compartir la WiFi no impide crearlas.`}</p>}
          {detailError && <p className="platform-admin-inline-error" role="alert">{detailError}</p>}
          {notice && <p className="platform-admin-inline-success" role="status">{notice}</p>}
          <nav className="platform-detail-tabs" aria-label="Secciones del jugador">{detailTabs.map(item => <button type="button" key={item.id} className={tab === item.id ? 'active' : ''} aria-pressed={tab === item.id} onClick={() => { setTab(item.id); setDetailError(''); }}>{item.label}</button>)}</nav>
          {tab === 'summary' && <div className="platform-tab-content">
            <div className="platform-stats"><div><small>Cargas aprobadas</small><strong>{detail.stats.approved_deposits} <span>de {detail.stats.deposits}</span></strong><b>{money(Number(detail.stats.approved_deposit_amount) || 0)}</b></div><div><small>Retiros aprobados</small><strong>{detail.stats.approved_withdrawals} <span>de {detail.stats.withdrawals}</span></strong><b>{money(Number(detail.stats.approved_withdrawal_amount) || 0)}</b></div></div>
            <section className="platform-overview-section"><div className="platform-section-heading"><div><span>01 · Cuenta</span><h3>Información principal</h3></div><button type="button" onClick={() => setTab('data')}>Ver y editar <ChevronRight size={15} /></button></div><dl className="platform-overview-grid"><div><dt>ID de plataforma</dt><dd>{detail.profile.external_user_id || 'Sin cargar'}</dd></div><div><dt>Teléfono</dt><dd>{detail.profile.phone ? `+${detail.profile.phone}` : 'Sin cargar'}</dd></div><div><dt>Recomendado por</dt><dd>{detail.referrer ? `@${detail.referrer.name}` : detail.access_request?.referral_code ? `Código @${detail.access_request.referral_code}` : 'Sin recomendador'}</dd></div><div><dt>Último ingreso</dt><dd>{detail.auth.last_sign_in_at ? date(detail.auth.last_sign_in_at) : 'Todavía no ingresó'}</dd></div></dl></section>
            <section className="platform-overview-section"><div className="platform-section-heading"><div><span>02 · Acceso</span><h3>Acceso al casino</h3></div><button type="button" onClick={() => setTab('access')}>Gestionar <ChevronRight size={15} /></button></div><div className="platform-overview-access"><span className={link ? 'ready' : 'missing'}>{link ? 'Enlace personal configurado' : 'Falta el enlace personal'}</span><small>{suspended ? 'El acceso está suspendido.' : 'El acceso está activo.'}</small></div></section>
            <section className="platform-overview-section"><div className="platform-section-heading"><div><span>03 · Actividad</span><h3>Movimientos recientes</h3></div><button type="button" onClick={() => setTab('activity')}>Ver actividad <ChevronRight size={15} /></button></div><p className="platform-detail-muted">{detail.stats.last_activity_at ? `Última operación: ${date(detail.stats.last_activity_at)}` : 'Todavía no registra operaciones.'}</p></section>
          </div>}
          {tab === 'data' && <div className="platform-tab-content">
            <section className="platform-detail-section"><div className="platform-section-heading"><div><span>Datos del jugador</span><h3>Editar perfil</h3></div></div><form className="platform-detail-form" onSubmit={event => void saveProfile(event)} key={`${detail.profile.user_id}:${detail.profile.updated_at}`}><label>Nombre visible<input name="display_name" defaultValue={detail.profile.display_name} maxLength={80} required /></label><label>Teléfono<input name="phone" type="tel" defaultValue={detail.profile.phone ? `+${detail.profile.phone}` : ''} placeholder="Con código de país" maxLength={30} /></label><label>ID de plataforma<input name="external_user_id" defaultValue={detail.profile.external_user_id ?? ''} maxLength={80} /></label><label>WhatsApp principal<select name="whatsapp_principal_slot" defaultValue={detail.profile.whatsapp_principal_slot ?? ''}><option value="">Sin asignar</option>{principals.filter(item => item.active || item.slot === detail.profile.whatsapp_principal_slot).map(item => <option key={item.slot} value={item.slot}>Principal {item.slot} · +{item.phone}{item.active ? '' : ' (inactivo)'}</option>)}</select></label><button disabled={busy || demo}>Guardar datos</button></form></section>
            <section className="platform-detail-section"><div className="platform-section-heading"><div><span>Solo lectura</span><h3>Cuenta y origen</h3></div></div><dl className="platform-detail-grid">
              <div><dt>ID de usuario</dt><dd className="platform-long-value">{detail.profile.user_id}</dd></div><div><dt>Alta</dt><dd>{date(detail.profile.created_at)}</dd></div>
              <div><dt>Último ingreso</dt><dd>{detail.auth.last_sign_in_at ? date(detail.auth.last_sign_in_at) : 'Todavía no ingresó'}</dd></div><div><dt>Última operación</dt><dd>{detail.stats.last_activity_at ? date(detail.stats.last_activity_at) : 'Sin operaciones'}</dd></div>
              <div><dt>Teléfono</dt><dd>{detail.profile.phone ? `+${detail.profile.phone}` : 'Sin cargar'}</dd></div><div><dt>ID de plataforma</dt><dd>{detail.profile.external_user_id || 'Sin cargar'}</dd></div>
              <div><dt>WhatsApp principal</dt><dd>{detail.profile.whatsapp_principal_slot ? `Principal ${detail.profile.whatsapp_principal_slot}${detail.principal?.phone ? ` · +${detail.principal.phone}` : ''}` : 'Sin asignar'}</dd></div><div><dt>Recomendado por</dt><dd>{detail.referrer ? `@${detail.referrer.name}` : detail.access_request?.referral_code ? `Código @${detail.access_request.referral_code}` : 'Sin recomendador'}</dd></div>
              <div><dt>Solicitud</dt><dd>{detail.access_request ? date(detail.access_request.created_at) : 'No disponible'}</dd></div><div><dt>IP pública al solicitar acceso</dt><dd>{detail.access_request?.origin_ip || 'No registrada en esta solicitud'}</dd></div>
              <div className="platform-detail-wide"><dt>Navegador informado al solicitar acceso</dt><dd className="platform-long-value">{detail.access_request?.origin_user_agent || 'No registrado'}</dd></div>
            </dl><p className="platform-detail-note">La IP corresponde a la conexión usada al enviar la solicitud; puede ser compartida o cambiar. Las solicitudes anteriores solo conservan un hash y no permiten recuperarla.</p></section>
          </div>}
          {tab === 'access' && <div className="platform-tab-content platform-access-sections">
            <section className="platform-detail-section"><div className="platform-section-heading"><div><span>01 · Casino</span><h3>Enlace personal</h3></div><span className={`platform-access-indicator ${link ? 'ready' : 'missing'}`}>{link ? 'Configurado' : 'Pendiente'}</span></div><p className="platform-detail-muted">Este enlace abre el banner del casino para este jugador.</p><form className="platform-detail-form platform-link-form" onSubmit={event => void saveLink(event)}><label>URL personal<input type="url" value={linkInput} onChange={event => setLinkInput(event.target.value)} maxLength={2048} placeholder="https://casino.ejemplo.com/acceso/…" required /></label><div className="platform-inline-actions"><button disabled={busy || demo}><Link2 size={15} />Guardar enlace</button>{link && <a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />Abrir enlace</a>}</div></form></section>
            <section className="platform-detail-section"><div className="platform-section-heading"><div><span>02 · Credenciales</span><h3>Contraseña</h3></div></div><p className="platform-detail-muted">La nueva contraseña se envía al chat del portal y el jugador ve un aviso en Inicio.</p><form className="platform-detail-form platform-password-form" onSubmit={event => void resetPassword(event)}><label>Nueva contraseña<input type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} required /></label><button disabled={busy || demo || !detail.access_request || !detail.casino_link || !password}><KeyRound size={15} />Cambiar y avisar</button></form></section>
            <section className="platform-detail-section platform-access-control"><div className="platform-section-heading"><div><span>03 · Estado</span><h3>{suspended ? 'Acceso suspendido' : 'Acceso activo'}</h3></div></div><p className="platform-detail-muted">La suspensión impide nuevos ingresos y renovaciones de sesión. Una sesión abierta puede seguir activa hasta que venza su token.</p><button type="button" className={suspended ? 'reactivate' : 'suspend'} disabled={busy || demo} onClick={() => void changeSuspension()}>{suspended ? <ShieldCheck size={16} /> : <Ban size={16} />}{suspended ? 'Reactivar usuario' : 'Suspender usuario'}</button></section>
          </div>}
          {tab === 'activity' && <div className="platform-tab-content"><section className="platform-detail-section"><div className="platform-section-heading"><div><span>Actividad</span><h3>Últimas operaciones</h3></div><Activity size={18} aria-hidden="true" /></div>{detail.operations.length ? <div className="platform-operations">{detail.operations.map(item => <div key={item.id}><span><strong>{item.kind === 'deposit' ? 'Carga' : 'Retiro'}</strong><small>{date(item.created_at)}</small></span><strong>{money(Number(item.amount))}</strong><em className={`status-${item.status}`}>{statusName[item.status]}</em></div>)}</div> : <p className="platform-detail-muted">Todavía no tiene cargas ni retiros.</p>}</section></div>}
        </>}
      </div>
    </div>
  </section>;
}
