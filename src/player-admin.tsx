import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Pencil, Phone, UserPlus, UserRound } from 'lucide-react';
import { InputError } from '../supabase/functions/_shared/validation';
import { supabase } from './lib';

type Principal = { slot: number; phone: string; active: boolean };
type Player = {
  user_id: string; username: string | null; display_name: string; phone: string | null;
  external_user_id: string | null; whatsapp_principal_slot: number | null; whatsapp_principal_phone: string | null;
  deposits: number; withdrawals: number; created_at: string;
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
  const [players, setPlayers] = useState<Player[]>([]);
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [loading, setLoading] = useState(!demo && !!supabase);
  const [loadError, setLoadError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [passwordId, setPasswordId] = useState<string | null>(null);

  async function refresh() {
    if (demo || !supabase) { setLoading(false); return; }
    const [directory, contacts] = await Promise.all([
      supabase.from('player_directory').select('user_id,username,display_name,phone,external_user_id,whatsapp_principal_slot,whatsapp_principal_phone,deposits,withdrawals,created_at').order('created_at', { ascending: false }),
      supabase.from('whatsapp_principals').select('slot,phone,active').order('slot'),
    ]);
    setLoading(false);
    const failure = directory.error ?? contacts.error;
    if (failure) { setLoadError('No pudimos cargar los jugadores. Aplicá la migración 017 y desplegá manage-players.'); return; }
    setLoadError('');
    setPlayers((directory.data ?? []).map(row => ({ ...row, deposits: Number(row.deposits) || 0, withdrawals: Number(row.withdrawals) || 0 })) as Player[]);
    setPrincipals((contacts.data ?? []) as Principal[]);
  }
  useEffect(() => { void refresh(); }, [demo]);

  async function invoke(body: Record<string, unknown>, fallback: string) {
    if (demo || !supabase) throw new InputError('La vista previa no modifica jugadores.');
    const result = await supabase.functions.invoke('manage-players', { body });
    if (result.error || (!result.data?.ok && !result.data?.user_id)) throw await functionError(result.error, result.data, fallback);
  }
  async function createPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await action(async () => {
      await invoke({
        action: 'create', username: form.get('username'), password: form.get('password'), phone: form.get('phone'),
        external_user_id: form.get('external_user_id'), whatsapp_principal_slot: form.get('whatsapp_principal_slot'),
      }, 'No se pudo crear el jugador.');
      element.reset();
      await refresh();
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
  const activePrincipals = principals.filter(item => item.active);

  return <section className="player-admin" aria-labelledby="players-title">
    <div className="account-heading"><div><h1 id="players-title">Jugadores</h1><p>Creá sus accesos y asigná el WhatsApp principal que los atenderá.</p></div><strong>{players.length} jugadores</strong></div>
    <form className="player-create" onSubmit={createPlayer}>
      <div className="player-form-title"><UserPlus /><div><strong>Nuevo jugador</strong><small>El teléfono y el principal son obligatorios.</small></div></div>
      <div className="player-create-fields">
        <label>Nombre de usuario<input name="username" minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+" autoCapitalize="none" spellCheck={false} placeholder="juanito" required /></label>
        <label>Contraseña<input name="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" placeholder="Mínimo 8 caracteres" required /></label>
        <label>Teléfono del jugador<input name="phone" type="tel" maxLength={30} placeholder="Ej.: +595981123456" required /></label>
        <label>ID de la plataforma <span>(opcional)</span><input name="external_user_id" maxLength={80} placeholder="ID externo" /></label>
        <label>WhatsApp principal<select name="whatsapp_principal_slot" required defaultValue=""><option value="" disabled>Seleccionar principal</option>{activePrincipals.map(item => <option key={item.slot} value={item.slot}>Principal {item.slot} · +{item.phone}</option>)}</select></label>
      </div>
      {!activePrincipals.length && <p className="player-form-warning">Primero cargá al menos un número en Contactos.</p>}
      <button className="cashier-create-submit" disabled={busy || loading || !activePrincipals.length}>Crear jugador</button>
    </form>
    {loading ? <p className="empty">Cargando jugadores…</p> : loadError ? <p className="empty">{loadError}</p> : !players.length ? <p className="empty">Todavía no hay jugadores registrados.</p> : <div className="player-list">{players.map(player => <article className="player-card" key={player.user_id}>
      <header className="player-card-header"><span className="player-avatar"><UserRound /></span><div><strong>{player.username ? `@${player.username}` : player.display_name}</strong><small>{player.phone ? `+${player.phone}` : 'Teléfono pendiente'}</small></div><span className={player.phone && player.whatsapp_principal_slot ? 'player-complete' : 'player-incomplete'}>{player.phone && player.whatsapp_principal_slot ? 'Completo' : 'Completar'}</span></header>
      <dl className="player-details"><div><dt>Principal</dt><dd>{player.whatsapp_principal_slot ? `Principal ${player.whatsapp_principal_slot}` : 'Sin asignar'}</dd></div><div><dt>ID plataforma</dt><dd>{player.external_user_id || 'Sin cargar'}</dd></div><div><dt>Actividad</dt><dd>{player.deposits} cargas · {player.withdrawals} retiros</dd></div></dl>
      {editId === player.user_id && <form className="player-edit-form" onSubmit={event => void updatePlayer(event, player)}><label>Teléfono<input name="phone" type="tel" maxLength={30} defaultValue={player.phone ? `+${player.phone}` : ''} required /></label><label>ID de la plataforma<input name="external_user_id" maxLength={80} defaultValue={player.external_user_id ?? ''} /></label><label>WhatsApp principal<select name="whatsapp_principal_slot" defaultValue={player.whatsapp_principal_slot ?? ''} required><option value="" disabled>Seleccionar principal</option>{activePrincipals.map(item => <option key={item.slot} value={item.slot}>Principal {item.slot} · +{item.phone}</option>)}</select></label><div><button disabled={busy}>Guardar datos</button><button type="button" onClick={() => setEditId(null)}>Cancelar</button></div></form>}
      {passwordId === player.user_id && <form className="player-password-form" onSubmit={event => void changePassword(event, player)}><input name="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" placeholder="Nueva contraseña" required /><button disabled={busy}>Guardar contraseña</button><button type="button" onClick={() => setPasswordId(null)}>Cancelar</button></form>}
      <div className="player-card-actions"><button type="button" onClick={() => { setPasswordId(null); setEditId(player.user_id); }}><Pencil />Editar datos</button><button type="button" onClick={() => { setEditId(null); setPasswordId(player.user_id); }}><KeyRound />Cambiar contraseña</button><a href={player.whatsapp_principal_phone ? `https://wa.me/${player.whatsapp_principal_phone}` : undefined} aria-disabled={!player.whatsapp_principal_phone} target="_blank" rel="noopener noreferrer"><Phone />Abrir principal</a></div>
    </article>)}</div>}
  </section>;
}
