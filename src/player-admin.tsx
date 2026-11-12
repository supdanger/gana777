import { useAdminRefreshVersion } from './admin-refresh';
import { AccountSecurityDialog } from './account-security';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, KeyRound, LogOut, Pencil, Phone, Search, UserPlus, UserRound, X } from 'lucide-react';
import { InputError } from '../supabase/functions/_shared/validation';
import { supabase } from './lib';
import { useViewState } from './view-state';
import { searchPattern, searchFilter } from './query-utils';

type Principal = { slot: number; phone: string; active: boolean };
type Player = {
  user_id: string; username: string | null; display_name: string; phone: string | null;
  external_user_id: string | null; whatsapp_principal_slot: number | null; whatsapp_principal_phone: string | null;
  deposits: number; withdrawals: number; created_at: string;
  referrer_user_id: string | null; referrer_name: string | null;
};

async function functionError(error: unknown, data: unknown, fallback: string): Promise<Error> {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return new InputError(data.error);
  if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    try {
      const body: unknown = await error.context.clone().json();
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return new InputError(body.error);
    } catch { /* Supabase may return a response without JSON. */ }
    if (error.context.status === 404) return new InputError('La función manage-players todavía no está desplegada en Supabase.');
    if (error.context.status === 403) return new InputError('No tenés permiso para gestionar jugadores.');
  }
  return new InputError(fallback);
}

export function PlayerAdmin({ demo, busy, action }: { demo: boolean; busy: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const adminRefresh = useAdminRefreshVersion('users');
  const [players, setPlayers] = useState<Player[]>([]);
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [loading, setLoading] = useState(!demo && !!supabase);
  const [loadError, setLoadError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [securityPlayer, setSecurityPlayer] = useState<Player | null>(null);
  const [passwordId, setPasswordId] = useState<string | null>(null);
  const [referrerQuery, setReferrerQuery] = useState('');
  const [referrerId, setReferrerId] = useState<string | null>(null);
  const [referrerOpen, setReferrerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [playerQuery, setPlayerQuery] = useViewState('players:query', '');

  const [playerPage, setPlayerPage] = useViewState('players:page', 0);
  const [playerTotal, setPlayerTotal] = useState(0);
  const [referrerPlayers, setReferrerPlayers] = useState<Player[]>([]);
  const [referrerLoading, setReferrerLoading] = useState(false);
  const requestVersion = useRef(0);
  const pageSize = 20;
  const columns = 'user_id,username,display_name,phone,external_user_id,whatsapp_principal_slot,whatsapp_principal_phone,deposits,withdrawals,created_at,referrer_user_id,referrer_name';
  function playerSearch(value: string) {
    const term = searchPattern(value);
    const fields = ['username', 'display_name', 'external_user_id'];
    const filters = [searchFilter(fields, term)];
    const phone = term.replace(/\D/g, '');
    if (phone) filters.push(searchFilter(['phone'], phone));
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(term)) filters.push(`user_id.eq.${term}`);
    return filters.join(',');
  }
  async function refresh(signal?: AbortSignal) {
    if (demo || !supabase) { setLoading(false); return; }
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      let query = supabase.from('player_directory').select(columns, { count: 'exact' })
        .order('created_at', { ascending: false }).order('user_id', { ascending: false })
        .range(playerPage * pageSize, (playerPage + 1) * pageSize - 1);
      if (searchPattern(playerQuery)) query = query.or(playerSearch(playerQuery));
      if (signal) query = query.abortSignal(signal);
      const directory = await query;
      if (signal?.aborted || version !== requestVersion.current) return;
      if (directory.error) throw directory.error;
      const total = directory.count ?? 0;
      const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
      if (playerPage > lastPage) { setPlayerPage(lastPage); return; }
      setLoadError('');
      setPlayers((directory.data ?? []).map(row => ({ ...row, deposits: Number(row.deposits) || 0, withdrawals: Number(row.withdrawals) || 0 })) as Player[]);
      setPlayerTotal(total);
    } catch { if (!signal?.aborted && version === requestVersion.current) setLoadError('No pudimos cargar los jugadores. Revisá tu conexión e intentá nuevamente.'); }
    finally { if (!signal?.aborted && version === requestVersion.current) setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(controller.signal), playerQuery.trim() ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); requestVersion.current++; };
  }, [demo, playerQuery, playerPage, adminRefresh]);
  useEffect(() => {
    if (demo || !supabase) return;
    let alive = true;
    void supabase.from('whatsapp_principals').select('slot,phone,active').order('slot').then(({ data, error }) => {
      if (!alive) return;
      if (error) setLoadError('No pudimos cargar los contactos. Actualizá la sección antes de crear un jugador.');
      else setPrincipals((data ?? []) as Principal[]);
    });
    return () => { alive = false; };
  }, [demo]);
  useEffect(() => {
    const term = searchPattern(referrerQuery);
    if (demo || !supabase || !referrerOpen || referrerId || !term) { setReferrerPlayers([]); setReferrerLoading(false); return; }
    const db = supabase;
    const controller = new AbortController();
    setReferrerLoading(true);
    setReferrerPlayers([]);
    const timer = window.setTimeout(async () => {
      try {
        const result = await db.from('player_directory').select('user_id,username,display_name,external_user_id')
          .or(playerSearch(term)).order('username').limit(8).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (result.error) throw result.error;
        setReferrerPlayers((result.data ?? []) as Player[]);
      } catch { if (!controller.signal.aborted) setLoadError('No pudimos buscar recomendadores. Intentá nuevamente.'); }
      finally { if (!controller.signal.aborted) setReferrerLoading(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [demo, referrerQuery, referrerOpen, referrerId]);

  async function invoke(body: Record<string, unknown>, fallback: string) {
    if (demo || !supabase) throw new InputError('La vista previa no modifica jugadores.');
    const result = await supabase.functions.invoke('manage-players', { body });
    if (result.error || (!result.data?.ok && !result.data?.user_id)) throw await functionError(result.error, result.data, fallback);
    return result.data;
  }
  async function createPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no modifica jugadores.');
      if (referrerQuery.trim() && !referrerId) throw new InputError('Seleccioná un recomendador de los resultados o borrá la búsqueda.');
      if (referrerId) {
        // Older deployments silently ignore referrer_user_id. Check before creating an account.
        const capability = await supabase!.functions.invoke('manage-players', { body: { action: 'referral-capabilities' } });
        if (capability.error || capability.data?.referrals !== true) {
          throw new InputError('No se creó el jugador: no pudimos confirmar que el servidor registre recomendaciones. Aplicá la migración 022, ejecutá npm run deploy:functions y revisá la conexión antes de reintentar.');
        }
      }
      const created = await invoke({
        action: 'create', username: form.get('username'), password: form.get('password'), phone: form.get('phone'),
        external_user_id: form.get('external_user_id'), whatsapp_principal_slot: form.get('whatsapp_principal_slot'),
        referrer_user_id: referrerId,
      }, 'No se pudo crear el jugador.');
      element.reset();
      setReferrerQuery(''); setReferrerId(null); setReferrerOpen(false);
      await refresh();
      if (referrerId) {
        const link = await supabase!.from('player_referrals').select('referrer_user_id').eq('referred_user_id', created.user_id).maybeSingle();
        if (link.error || link.data?.referrer_user_id !== referrerId) {
          throw new InputError('El jugador se creó, pero no pudimos confirmar su recomendación. No vuelvas a crear la cuenta: revisá el vínculo y el despliegue de manage-players antes de aprobar su primera carga.');
        }
      }
      setCreateOpen(false);
    });
  }
  async function updatePlayer(event: FormEvent<HTMLFormElement>, player: Player) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(async () => {
      await invoke({ action: 'update', user_id: player.user_id, phone: form.get('phone'), external_user_id: form.get('external_user_id'), whatsapp_principal_slot: form.get('whatsapp_principal_slot') }, 'No se pudieron actualizar los datos.');
      setEditId(null);
      await refresh();
    });
  }
  async function changePassword(event: FormEvent<HTMLFormElement>, player: Player) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(async () => {
      await invoke({ action: 'password', user_id: player.user_id, password: form.get('password') }, 'No se pudo cambiar la contraseña.');
      setPasswordId(null);
    });
  }
  async function forceLogout(player: Player) {
    if (!window.confirm(`¿Forzar la salida de ${player.username ? `@${player.username}` : player.display_name}? Se cerrará su sesión activa.`)) return;
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no modifica jugadores.');
      const result = await supabase.rpc('force_player_logout', { target_user_id: player.user_id });
      if (result.error) throw new InputError('No se pudo forzar la salida. Aplicá la migración 084 y revisá tus permisos.');
    });
  }
  const activePrincipals = principals.filter(item => item.active);
  const normalizedPlayerQuery = playerQuery.trim();
  const filteredPlayers = players;
  const referrerTerm = referrerQuery.trim();
  const referrerMatches = referrerPlayers;
  const playerPages = Math.max(1, Math.ceil(playerTotal / pageSize));

  return <section className="player-admin" aria-labelledby="players-title">
    {securityPlayer && <AccountSecurityDialog userId={securityPlayer.user_id} username={securityPlayer.username || securityPlayer.display_name} onClose={() => setSecurityPlayer(null)} />}
    <div className="account-heading"><div><h1 id="players-title">Jugadores</h1><p>Creá sus accesos y asigná el WhatsApp principal que los atenderá.</p></div><strong>{playerTotal} jugadores</strong></div>
    <form className={`player-create${createOpen ? ' is-open' : ' is-collapsed'}`} onSubmit={createPlayer}>
      <button type="button" className="player-form-toggle" aria-expanded={createOpen} aria-controls="player-create-fields" onClick={() => setCreateOpen(open => !open)}><span className="player-form-title"><UserPlus /><span><strong>Nuevo jugador</strong><small>{createOpen ? 'El teléfono y el principal son obligatorios.' : 'Abrí para crear una cuenta.'}</small></span></span><ChevronDown size={19} className={createOpen ? 'is-open' : ''} /></button>
      {createOpen && <div id="player-create-fields" className="player-create-content"><div className="player-create-fields">
        <label>Nombre de usuario<input name="username" minLength={3} maxLength={32} pattern={'[a-zA-Z0-9._\\-]+'} autoCapitalize="none" spellCheck={false} placeholder="juanito" required /></label>
        <label>Contraseña<input name="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" placeholder="Mínimo 8 caracteres" required /></label>
        <label>Teléfono del jugador<input name="phone" type="tel" maxLength={30} placeholder="Ej.: +595981123456" required /></label>
        <label>ID de la plataforma <span>(opcional)</span><input name="external_user_id" maxLength={80} placeholder="ID externo" /></label>
        <label>WhatsApp principal<select name="whatsapp_principal_slot" required defaultValue=""><option value="" disabled>Seleccionar principal</option>{activePrincipals.map(item => <option key={item.slot} value={item.slot}>Principal {item.slot} · +{item.phone}</option>)}</select></label>
        <div className="player-referrer-field" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setReferrerOpen(false); }}>
          <label htmlFor="player-referrer-search">Recomendado por <span>(opcional)</span></label>
          <div className="player-referrer-input">
            <Search size={18} aria-hidden="true" />
            <input id="player-referrer-search" type="search" role="combobox" aria-autocomplete="list" aria-expanded={referrerOpen && !!referrerTerm && !referrerId} aria-controls={referrerOpen && referrerTerm && !referrerId ? 'player-referrer-results' : undefined} autoComplete="off" spellCheck={false} value={referrerQuery} placeholder="Buscar usuario o ID de plataforma" onFocus={() => setReferrerOpen(true)} onChange={event => { setReferrerQuery(event.target.value); setReferrerId(null); setReferrerOpen(true); }} onKeyDown={event => { if (event.key === 'Escape') setReferrerOpen(false); if (event.key === 'ArrowDown' && referrerOpen && referrerMatches.length) { event.preventDefault(); document.getElementById('player-referrer-option-0')?.focus(); } }} />
            {referrerId && <button type="button" className="player-referrer-clear" aria-label="Quitar recomendador" onClick={() => { setReferrerQuery(''); setReferrerId(null); setReferrerOpen(false); document.getElementById('player-referrer-search')?.focus(); }}><X size={17} /></button>}
          </div>
          <input type="hidden" name="referrer_user_id" value={referrerId ?? ''} />
          {referrerOpen && referrerTerm && !referrerId && <div id="player-referrer-results" className="player-referrer-results" role="listbox" aria-label="Usuarios encontrados">
            {referrerMatches.length ? referrerMatches.map((player, index) => <button id={`player-referrer-option-${index}`} type="button" role="option" aria-selected={false} key={player.user_id} onClick={() => { setReferrerId(player.user_id); setReferrerQuery(player.username ? `@${player.username}` : player.display_name); setReferrerOpen(false); }} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = index + (event.key === 'ArrowDown' ? 1 : -1); if (next < 0) document.getElementById('player-referrer-search')?.focus(); else document.getElementById(`player-referrer-option-${Math.min(next, referrerMatches.length - 1)}`)?.focus(); } }}><strong>{player.username ? `@${player.username}` : player.display_name}</strong>{player.external_user_id && <small>ID {player.external_user_id}</small>}</button>) : <p>{referrerLoading ? 'Buscando jugadores…' : 'No encontramos jugadores con esa búsqueda.'}</p>}
          </div>}
          {referrerId && <small className="player-referrer-selected">Recomendador seleccionado</small>}
          <small>Al aprobar la primera carga del nuevo jugador se generarán $1.000 para cada uno. Elegilo ahora; el vínculo no se puede cambiar después.</small>
        </div>
      </div>
      {!activePrincipals.length && <p className="player-form-warning">Primero cargá al menos un número en Contactos.</p>}
      <button className="cashier-create-submit" disabled={busy || loading || !activePrincipals.length}>Crear jugador</button></div>}
    </form>
    <label className="player-directory-search"><Search size={18} aria-hidden="true" /><input type="search" value={playerQuery} onChange={event => { setPlayerQuery(event.target.value); setPlayerPage(0); }} placeholder="Buscar por usuario, ID o teléfono" aria-label="Buscar jugadores por nombre de usuario, ID o teléfono" /></label>
    {loading && players.length > 0 && <p className="list-updating" role="status">Actualizando jugadores…</p>}
    {loading && !players.length ? <p className="empty">Cargando jugadores…</p> : loadError ? <p className="empty">{loadError}</p> : !filteredPlayers.length ? <p className="empty">{normalizedPlayerQuery ? 'No encontramos jugadores con esa búsqueda.' : 'Todavía no hay jugadores registrados.'}</p> : <div className="player-list">{filteredPlayers.map(player => <article className="player-card" key={player.user_id}>
      <header className="player-card-header"><span className="player-avatar"><UserRound /></span><div><strong>{player.username ? `@${player.username}` : player.display_name}</strong><small>{player.phone ? `+${player.phone}` : 'Teléfono pendiente'}</small></div><span className={player.phone && player.whatsapp_principal_slot ? 'player-complete' : 'player-incomplete'}>{player.phone && player.whatsapp_principal_slot ? 'Completo' : 'Completar'}</span></header>
      <dl className="player-details"><div><dt>Principal</dt><dd>{player.whatsapp_principal_slot ? `Principal ${player.whatsapp_principal_slot}` : 'Sin asignar'}</dd></div><div><dt>ID plataforma</dt><dd>{player.external_user_id || 'Sin cargar'}</dd></div><div><dt>Actividad</dt><dd>{player.deposits} cargas · {player.withdrawals} retiros</dd></div></dl>
      <p className="player-referrer">{player.referrer_user_id ? <>Recomendado por <strong>{player.referrer_name || 'Jugador registrado'}</strong></> : 'Sin recomendador registrado · No genera premios por recomendación.'}</p>
      {editId === player.user_id && <form className="player-edit-form" onSubmit={event => void updatePlayer(event, player)}><label>Teléfono<input name="phone" type="tel" maxLength={30} defaultValue={player.phone ? `+${player.phone}` : ''} required /></label><label>ID de la plataforma<input name="external_user_id" maxLength={80} defaultValue={player.external_user_id ?? ''} /></label><label>WhatsApp principal<select name="whatsapp_principal_slot" defaultValue={player.whatsapp_principal_slot ?? ''} required><option value="" disabled>Seleccionar principal</option>{activePrincipals.map(item => <option key={item.slot} value={item.slot}>Principal {item.slot} · +{item.phone}</option>)}</select></label><div><button disabled={busy}>Guardar datos</button><button type="button" onClick={() => setEditId(null)}>Cancelar</button></div></form>}
      {passwordId === player.user_id && <form className="player-password-form" onSubmit={event => void changePassword(event, player)}><input name="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" placeholder="Nueva contraseña" required /><button disabled={busy}>Guardar contraseña</button><button type="button" onClick={() => setPasswordId(null)}>Cancelar</button></form>}
      <div className="player-card-actions"><button type="button" disabled={busy || demo} onClick={() => setSecurityPlayer(player)}>Seguridad / bloquear usuario</button><button type="button" onClick={() => { setPasswordId(null); setEditId(player.user_id); }}><Pencil />Editar datos</button><button type="button" onClick={() => { setEditId(null); setPasswordId(player.user_id); }}><KeyRound />Cambiar contraseña</button><button type="button" onClick={() => void forceLogout(player)} disabled={busy || demo}><LogOut />Forzar salida</button><a href={player.whatsapp_principal_phone ? `https://wa.me/${player.whatsapp_principal_phone}` : undefined} aria-disabled={!player.whatsapp_principal_phone} target="_blank" rel="noopener noreferrer"><Phone />Abrir principal</a></div>
    </article>)}</div>}
    {playerPages > 1 && <nav className="loads-pager" aria-label="Páginas de jugadores"><button type="button" disabled={!playerPage || loading} onClick={() => setPlayerPage(page => page - 1)}>Anterior</button><span>{playerPage + 1} de {playerPages} · {playerTotal} jugadores</span><button type="button" disabled={playerPage + 1 >= playerPages || loading} onClick={() => setPlayerPage(page => page + 1)}>Siguiente</button></nav>}
  </section>;
}
