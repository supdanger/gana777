import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Ban, ExternalLink, KeyRound, Layers3, Link2, RefreshCw, Search, ShieldCheck, UserRound } from 'lucide-react';
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
};
const statusName = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };
const pageSize = 20;

export function PlatformAdmin({ demo, busy, action }: { demo: boolean; busy: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(!demo);
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
  const listVersion = useRef(0);
  const selectedIdRef = useRef('');
  selectedIdRef.current = selectedId;

  async function load(reset: boolean, term = search) {
    if (demo || !supabase) { setLoading(false); return; }
    const version = ++listVersion.current;
    setLoading(true);
    let request = supabase.from('user_profiles').select('user_id,username,created_at', { count: 'exact' })
      .eq('account_origin', 'platform').order('created_at', { ascending: false }).order('user_id', { ascending: false })
      .range(reset ? 0 : players.length, (reset ? 0 : players.length) + pageSize - 1);
    if (term) request = request.ilike('username', `%${term}%`);
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
  useEffect(() => { setDetail(null); setDetailError(''); setNotice(''); setPassword(''); setLinkInput(''); if (selectedId) void loadDetail(selectedId); }, [selectedId, demo]);

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
  return <section className="platform-admin" aria-labelledby="platform-title">
    <div className="account-heading"><div><h1 id="platform-title">Platform</h1><p>Gestioná las cuentas creadas desde Solicitudes y consultá su actividad.</p></div><strong>{total} {total === 1 ? 'cuenta' : 'cuentas'}</strong></div>
    <div className="platform-admin-layout">
      <aside className="platform-admin-panel">
        <div className="platform-admin-toolbar"><span><Layers3 size={18} /> Usuarios Platform</span><button type="button" disabled={loading || demo} onClick={() => void load(true)} aria-label="Actualizar usuarios"><RefreshCw size={15} /></button></div>
        <form className="platform-admin-search" onSubmit={event => { event.preventDefault(); setSearch(query.trim().replace(/^@/, '')); }}><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar usuario" maxLength={32} aria-label="Buscar usuario Platform" /><button type="submit">Buscar</button></form>
        {search && <p className="platform-admin-hint">Resultados para “{search}”</p>}
        {error && <p className="platform-admin-empty" role="alert">{error}</p>}
        {!error && !loading && !players.length && <p className="platform-admin-empty">No encontramos cuentas Platform.</p>}
        <div className="platform-admin-list">{players.map(player => <button type="button" key={player.user_id} className={`platform-admin-row${selectedId === player.user_id ? ' active' : ''}`} onClick={() => setSelectedId(player.user_id)}><span className="platform-admin-avatar"><UserRound size={19} /></span><span><strong>{player.username ? `@${player.username}` : 'Usuario sin nombre'}</strong><small>Creado {date(player.created_at)}</small></span></button>)}</div>
        {loading && <p className="platform-admin-empty">Cargando cuentas…</p>}
        {!loading && players.length < total && <button type="button" className="platform-admin-more" onClick={() => void load(false)}>Mostrar más</button>}
      </aside>
      <div className="platform-admin-detail">
        {!selectedId ? <div className="platform-admin-placeholder"><UserRound size={32} /><h2>Elegí un usuario</h2><p>Acá vas a ver su ficha, actividad y herramientas de gestión.</p></div> : detailError && !detail ? <p className="platform-admin-empty" role="alert">{detailError}</p> : !detail ? <p className="platform-admin-empty">Cargando ficha…</p> : <>
          <header className="platform-detail-header"><div><span className="platform-detail-eyebrow">Cuenta Platform</span><h2>@{detail.profile.username}</h2><p>{detail.profile.display_name}</p></div><span className={`platform-admin-status${suspended ? ' is-suspended' : ''}`}>{suspended ? 'Suspendida' : 'Activa'}</span></header>
          {detailError && <p className="platform-admin-inline-error" role="alert">{detailError}</p>}
          {notice && <p className="platform-admin-inline-success" role="status">{notice}</p>}
          <div className="platform-stats"><div><small>Cargas aprobadas</small><strong>{detail.stats.approved_deposits} / {detail.stats.deposits}</strong><span>{money(Number(detail.stats.approved_deposit_amount) || 0)}</span></div><div><small>Retiros aprobados</small><strong>{detail.stats.approved_withdrawals} / {detail.stats.withdrawals}</strong><span>{money(Number(detail.stats.approved_withdrawal_amount) || 0)}</span></div></div>
          <section className="platform-detail-section"><h3>Cuenta y origen</h3><dl className="platform-detail-grid">
            <div><dt>ID de usuario</dt><dd className="platform-long-value">{detail.profile.user_id}</dd></div><div><dt>Alta</dt><dd>{date(detail.profile.created_at)}</dd></div>
            <div><dt>Último ingreso</dt><dd>{detail.auth.last_sign_in_at ? date(detail.auth.last_sign_in_at) : 'Todavía no ingresó'}</dd></div><div><dt>Última operación</dt><dd>{detail.stats.last_activity_at ? date(detail.stats.last_activity_at) : 'Sin operaciones'}</dd></div>
            <div><dt>Teléfono</dt><dd>{detail.profile.phone ? `+${detail.profile.phone}` : 'Sin cargar'}</dd></div><div><dt>ID de plataforma</dt><dd>{detail.profile.external_user_id || 'Sin cargar'}</dd></div>
            <div><dt>WhatsApp principal</dt><dd>{detail.profile.whatsapp_principal_slot ? `Principal ${detail.profile.whatsapp_principal_slot}${detail.principal?.phone ? ` · +${detail.principal.phone}` : ''}` : 'Sin asignar'}</dd></div><div><dt>Recomendado por</dt><dd>{detail.referrer ? `@${detail.referrer.name}` : detail.access_request?.referral_code ? `Código @${detail.access_request.referral_code}` : 'Sin recomendador'}</dd></div>
            <div><dt>Solicitud</dt><dd>{detail.access_request ? date(detail.access_request.created_at) : 'No disponible'}</dd></div><div><dt>IP pública al solicitar acceso</dt><dd>{detail.access_request?.origin_ip || 'No registrada en esta solicitud'}</dd></div>
            <div className="platform-detail-wide"><dt>Navegador informado al solicitar acceso</dt><dd className="platform-long-value">{detail.access_request?.origin_user_agent || 'No registrado'}</dd></div>
          </dl><p className="platform-detail-note">La IP corresponde a la conexión usada al enviar la solicitud; puede ser compartida o cambiar. Las solicitudes anteriores solo conservan un hash y no permiten recuperarla.</p></section>
          <section className="platform-detail-section"><h3>Últimas operaciones</h3>{detail.operations.length ? <div className="platform-operations">{detail.operations.map(item => <div key={item.id}><span><strong>{item.kind === 'deposit' ? 'Carga' : 'Retiro'}</strong><small>{date(item.created_at)}</small></span><strong>{money(Number(item.amount))}</strong><em>{statusName[item.status]}</em></div>)}</div> : <p className="platform-detail-muted">Todavía no tiene cargas ni retiros.</p>}</section>
          <section className="platform-detail-section"><h3>Editar datos</h3><form className="platform-detail-form" onSubmit={event => void saveProfile(event)} key={`${detail.profile.user_id}:${detail.profile.updated_at}`}><label>Nombre visible<input name="display_name" defaultValue={detail.profile.display_name} maxLength={80} required /></label><label>Teléfono<input name="phone" type="tel" defaultValue={detail.profile.phone ? `+${detail.profile.phone}` : ''} placeholder="Con código de país" maxLength={30} /></label><label>ID de plataforma<input name="external_user_id" defaultValue={detail.profile.external_user_id ?? ''} maxLength={80} /></label><label>WhatsApp principal<select name="whatsapp_principal_slot" defaultValue={detail.profile.whatsapp_principal_slot ?? ''}><option value="">Sin asignar</option>{principals.filter(item => item.active || item.slot === detail.profile.whatsapp_principal_slot).map(item => <option key={item.slot} value={item.slot}>Principal {item.slot} · +{item.phone}{item.active ? '' : ' (inactivo)'}</option>)}</select></label><button disabled={busy || demo}>Guardar datos</button></form></section>
          <section className="platform-detail-section"><h3>Enlace personal del casino</h3><form className="platform-detail-form platform-link-form" onSubmit={event => void saveLink(event)}><label>URL personal<input type="url" value={linkInput} onChange={event => setLinkInput(event.target.value)} maxLength={2048} placeholder="https://casino.ejemplo.com/acceso/…" required /></label><div className="platform-inline-actions"><button disabled={busy || demo}><Link2 size={15} />Guardar enlace</button>{link && <a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />Abrir enlace</a>}</div></form></section>
          <section className="platform-detail-section"><h3>Contraseña</h3><p className="platform-detail-muted">Al cambiarla, se envían las nuevas credenciales al chat del portal. El jugador verá un aviso en Inicio.</p><form className="platform-detail-form platform-password-form" onSubmit={event => void resetPassword(event)}><label>Nueva contraseña<input type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} required /></label><button disabled={busy || demo || !detail.access_request || !detail.casino_link || !password}><KeyRound size={15} />Cambiar y avisar</button></form></section>
          <section className="platform-detail-section platform-access-control"><h3>Estado de acceso</h3><p className="platform-detail-muted">La suspensión impide nuevos ingresos y renovaciones de sesión. Una sesión abierta puede seguir activa hasta que venza su token.</p><button type="button" className={suspended ? 'reactivate' : 'suspend'} disabled={busy || demo} onClick={() => void changeSuspension()}>{suspended ? <ShieldCheck size={16} /> : <Ban size={16} />}{suspended ? 'Reactivar usuario' : 'Suspender usuario'}</button></section>
        </>}
      </div>
    </div>
  </section>;
}
