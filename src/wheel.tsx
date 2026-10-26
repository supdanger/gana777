import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Disc, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { InputError, parseUuid } from '../supabase/functions/_shared/validation';
import { useContent } from './content';
import { date, money, supabase } from './lib';
import { wheelAmountLabel, wheelCycleSummary, wheelFaces, wheelLandingRotation, wheelSectorOffset, wheelWaitLabel, type WheelSlice } from './wheel-sequence';
import './wheel.css';

type WheelPrize = WheelSlice & { sort_order?: number };
type SpinStatus = 'pending' | 'reserved' | 'credited';
type PlayerSpin = { id: string; amount: number; status: SpinStatus; created_at: string; credited_at: string | null };
type AdminSpin = PlayerSpin & { user_id: string; username: string; external_user_id: string | null; reserved_by: string | null; total_count: number };
type WheelState = { can_spin: boolean; next_spin_at: string | null; message: string | null; prizes: WheelPrize[]; spins: PlayerSpin[] };
type Draft = { key: string; amount: string; slots: string; active: boolean };

const defaultPrizes: WheelPrize[] = [
  { amount: 500, slots: 6, sort_order: 1 },
  { amount: 1000, slots: 5, sort_order: 2 },
  { amount: 2000, slots: 3, sort_order: 3 },
  { amount: 10000, slots: 1, sort_order: 4 },
];
const playerStatus: Record<SpinStatus, string> = { pending: 'Pendiente', reserved: 'En proceso', credited: 'Acreditado' };
const adminStatus: Record<SpinStatus, string> = {
  pending: 'Pendiente de acreditación', reserved: 'En proceso de acreditación', credited: 'Acreditado',
};
const wheelErrors = new Set([
  'Tenés que ingresar para girar.',
  'La ruleta es solo para jugadores.',
  'Ya giraste. El próximo giro se habilita 24 horas después.',
  'La ruleta no tiene premios activos.',
  'La ruleta necesita al menos un premio.',
  'Cada premio necesita un monto entero.',
  'Cada premio necesita entre 1 y 40 espacios.',
  'No puede haber dos premios con el mismo monto.',
  'La ruleta acepta hasta 60 espacios.',
  'No hay espacio para armar la ruleta.',
  'No tenés permiso para gestionar la ruleta.',
  'No tenés permiso para cambiar los premios de la ruleta.',
  'No tenés permiso para prender la ruleta.',
  'La ruleta está apagada.',
  'No tenés permiso para acreditar premios de la ruleta.',
  'El premio ya fue acreditado o no existe.',
  'Otro operador está acreditando este premio.',
  'El premio ya no existe.',
  'No se puede liberar esta reserva.',
  'Tomá el premio antes de acreditar. Si está reservado, debe confirmarlo el mismo operador.',
  'Filtro de ruleta no válido.',
]);
const blueFills = ['#082743', '#0b629c', '#1496d6', '#0a4f86', '#1278b8'];

function knownWheelError(message: string) {
  return wheelErrors.has(message) ? message : '';
}
function facePick(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 33 + id.charCodeAt(index)) >>> 0;
  return hash;
}
function sliceFill(prize: WheelSlice, prizes: readonly WheelSlice[]) {
  const biggest = Math.max(...prizes.map(item => item.amount));
  if (prize.amount === biggest) return 'url(#wheel-gold)';
  const index = prizes.filter(item => item.amount !== biggest).findIndex(item => item.amount === prize.amount);
  return blueFills[(index < 0 ? 0 : index) % blueFills.length];
}
function timesLabel(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}
function polar(radius: number, degrees: number) {
  const radians = degrees * Math.PI / 180;
  return [200 + radius * Math.cos(radians), 200 + radius * Math.sin(radians)];
}
function parseDrafts(drafts: readonly Draft[]) {
  const active: WheelSlice[] = [];
  const seen = new Set<number>();
  for (const draft of drafts) {
    const amount = Number(draft.amount.trim().replace(/\./g, ''));
    const slots = Number(draft.slots.trim());
    if (!Number.isInteger(amount) || amount <= 0 || amount > 100_000_000) return { active, error: 'Cada premio necesita un monto entero.' };
    if (!Number.isInteger(slots) || slots < 1 || slots > 40) return { active, error: 'Cada premio necesita entre 1 y 40 espacios.' };
    if (seen.has(amount)) return { active, error: 'No puede haber dos premios con el mismo monto.' };
    seen.add(amount);
    if (draft.active) active.push({ amount, slots });
  }
  if (!active.length) return { active, error: 'La ruleta necesita al menos un premio.' };
  if (active.reduce((sum, prize) => sum + prize.slots, 0) > 60) return { active, error: 'La ruleta acepta hasta 60 espacios.' };
  return { active, error: '' };
}

export function WheelDisc({ prizes, rotation, spinning, onSettled }: {
  prizes: readonly WheelSlice[]; rotation: number; spinning: boolean; onSettled?: () => void;
}) {
  const faces = useMemo(() => wheelFaces(prizes), [prizes]);
  const sectors = useMemo(() => {
    if (!faces.length) return [];
    const sweep = 360 / faces.length;
    return faces.map((amount, index) => {
      const start = -90 - sweep / 2 + index * sweep;
      const end = start + sweep;
      const mid = (start + end) / 2;
      const [x0, y0] = polar(164, start);
      const [x1, y1] = polar(164, end);
      const [labelX, labelY] = polar(118, mid);
      const turns = ((mid % 360) + 360) % 360;
      return {
        amount, index, sweep, x0, y0, x1, y1, labelX, labelY,
        textRotation: turns > 90 && turns < 270 ? mid + 180 : mid,
        fontSize: sweep >= 20 ? 14 : sweep >= 12 ? 11 : 9,
        fill: sliceFill({ amount, slots: 1 }, prizes),
      };
    });
  }, [faces, prizes]);
  const label = prizes.map(prize => wheelAmountLabel(prize.amount)).join(', ');
  return <div className="wheel-stage">
    <div className="wheel-glow" />
    <svg viewBox="0 0 400 400" role="img" aria-label={label ? `Ruleta con premios de ${label}` : 'Ruleta sin premios'}>
      <defs>
        <linearGradient id="wheel-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4c4" /><stop offset="0.5" stopColor="#ffc44d" /><stop offset="1" stopColor="#e09412" />
        </linearGradient>
        <radialGradient id="wheel-hub" cx="50%" cy="40%" r="65%">
          <stop offset="0" stopColor="#0a3a62" /><stop offset="1" stopColor="#02111d" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="188" fill="#021526" stroke="#0a6eab" strokeWidth="2" />
      <g className={spinning ? 'wheel-rotor is-spinning' : 'wheel-rotor'} style={{ transform: `rotate(${rotation}deg)` }} onTransitionEnd={event => { if (event.propertyName === 'transform') onSettled?.(); }}>
        {sectors.map(sector => sector.sweep >= 359
          ? <circle key={sector.index} cx="200" cy="200" r="164" fill={sector.fill} />
          : <path key={sector.index} d={`M 200 200 L ${sector.x0} ${sector.y0} A 164 164 0 ${sector.sweep > 180 ? 1 : 0} 1 ${sector.x1} ${sector.y1} Z`} fill={sector.fill} stroke="#001322" strokeWidth="3" />)}
        {sectors.map(sector => <text key={`label-${sector.index}`} x={sector.labelX} y={sector.labelY} textAnchor="middle" dominantBaseline="middle" fill={sector.fill.startsWith('url') ? '#3a2500' : '#fff'} fontSize={sector.fontSize} fontWeight="800" transform={`rotate(${sector.textRotation} ${sector.labelX} ${sector.labelY})`}>{wheelAmountLabel(sector.amount)}</text>)}
        {Array.from({ length: Math.max(faces.length, 1) }, (_, index) => {
          const [x, y] = polar(184, -90 + index * (360 / Math.max(faces.length, 1)));
          return <circle key={index} cx={x} cy={y} r="4.2" fill={index % 2 ? '#7af0ff' : '#ffd56a'} />;
        })}
      </g>
      <circle cx="200" cy="200" r="176" fill="none" stroke="#7ad7ff" strokeWidth="3" opacity="0.85" />
      <circle cx="200" cy="200" r="58" fill="url(#wheel-hub)" stroke="#38e7ff" strokeWidth="4" />
      <circle cx="200" cy="200" r="46" fill="none" stroke="#0651ff" strokeWidth="1.5" opacity="0.7" />
      <text x="200" y="194" textAnchor="middle" fill="#9adfff" fontSize="11" fontWeight="800" letterSpacing="1.5">GANA</text>
      <text x="200" y="216" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="900" fontStyle="italic">777</text>
      <path d="M200 18 L214 42 L186 42 Z" fill="#7af0ff" stroke="#042033" strokeWidth="2" />
    </svg>
  </div>;
}

export function UserWheel({ demo, userId }: { demo: boolean; userId: string }) {
  const [prizes, setPrizes] = useState<WheelPrize[]>(demo ? defaultPrizes : []);
  const [spins, setSpins] = useState<PlayerSpin[]>([]);
  const [canSpin, setCanSpin] = useState(demo);
  const [nextSpinAt, setNextSpinAt] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState('');
  const [localError, setLocalError] = useState('');
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [lockedPrizes, setLockedPrizes] = useState<WheelPrize[] | null>(null);
  const [revealed, setRevealed] = useState<number | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [now, setNow] = useState(() => Date.now());
  const spinToken = useRef(0);
  const pendingAmount = useRef<number | null>(null);
  const settleTimer = useRef(0);
  const shown = lockedPrizes ?? prizes;

  async function reload() {
    if (demo || !supabase) return;
    const { data, error } = await supabase.rpc('wheel_state');
    if (error) { setLocalError(knownWheelError(error.message) || 'No pudimos consultar la ruleta.'); setLoading(false); return; }
    const state = data as WheelState;
    const nextPrizes = (state.prizes ?? []).map(prize => ({ amount: Number(prize.amount), slots: Number(prize.slots), sort_order: Number(prize.sort_order ?? 0) }));
    setPrizes(nextPrizes.length ? nextPrizes : []);
    setSpins((state.spins ?? []).map(spin => ({ ...spin, amount: Number(spin.amount) })));
    setCanSpin(!!state.can_spin);
    setNextSpinAt(state.next_spin_at);
    setServerMessage(state.message ?? '');
    setLoading(false);
  }

  useEffect(() => {
    if (demo) return;
    void reload();
  }, [demo, userId]);
  useEffect(() => {
    if (demo || !supabase || !userId) return;
    const db = supabase;
    const refresh = () => { if (!spinToken.current) void reload(); };
    const channel = db.channel(`wheel-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wheel_spins', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wheel_prizes' }, refresh)
      .subscribe();
    window.addEventListener('focus', refresh);
    return () => { void db.removeChannel(channel); window.removeEventListener('focus', refresh); };
  }, [demo, userId]);

  function settle(amount: number, token: number) {
    if (spinToken.current !== token) return;
    spinToken.current = 0;
    pendingAmount.current = null;
    window.clearTimeout(settleTimer.current);
    setRevealed(amount);
    setSpinning(false);
    setLockedPrizes(null);
    void reload();
  }
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);
  useEffect(() => {
    if (!nextSpinAt || Date.parse(nextSpinAt) <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (Date.parse(nextSpinAt) <= current) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [nextSpinAt]);
  useEffect(() => {
    if (demo || !nextSpinAt) return;
    const delay = Date.parse(nextSpinAt) - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) return;
    const timer = window.setTimeout(() => { void reload(); }, delay + 400);
    return () => window.clearTimeout(timer);
  }, [demo, nextSpinAt]);
  async function spin() {
    if (spinning) return;
    setLocalError('');
    setRevealed(null);
    if (demo || !supabase) { setLocalError('La vista previa no gira la ruleta.'); return; }
    const token = spinToken.current + 1;
    spinToken.current = token;
    setSpinning(true);
    const painted = prizes;
    const { data, error } = await supabase.rpc('spin_wheel');
    if (spinToken.current !== token) return;
    if (error) {
      spinToken.current = 0;
      setSpinning(false);
      setLocalError(knownWheelError(error.message) || 'No pudimos girar la ruleta.');
      void reload();
      return;
    }
    const result = data as { id?: string; amount: number };
    const amount = Number(result.amount);
    pendingAmount.current = amount;
    const offset = wheelSectorOffset(painted, amount, facePick(result.id ?? ''));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (offset == null || reduced) {
      if (offset != null) setRotation(current => wheelLandingRotation(current, offset, 0));
      settle(amount, token);
      return;
    }
    setLockedPrizes(painted);
    setRotation(current => wheelLandingRotation(current, offset));
    settleTimer.current = window.setTimeout(() => settle(amount, token), 4600);
  }
  function onSettled() {
    const token = spinToken.current;
    const amount = pendingAmount.current;
    if (!token || amount == null) return;
    settle(amount, token);
  }

  const ready = demo || canSpin;
  const wait = wheelWaitLabel(nextSpinAt, now);
  const status = spinning ? 'Girando…' : revealed != null ? `Ganaste ${money(revealed)}. Quedó pendiente de acreditación.` : serverMessage || (wait ?? (ready ? 'Disponible ahora' : 'La ruleta no está disponible.'));
  return <section className="wheel-screen" aria-label="Ruleta">
    <p className="wheel-eyebrow">PREMIO DIARIO</p>
    {loading ? <p className="wheel-status" role="status">Cargando la ruleta…</p> : <WheelDisc prizes={shown} rotation={rotation} spinning={spinning} onSettled={onSettled} />}
    <p className={`wheel-status${revealed != null ? ' won' : ''}${wait && revealed == null && !spinning ? ' is-wait' : ''}`} role={wait && revealed == null && !spinning ? 'timer' : 'status'}>{status}</p>
    {localError && <p className="wheel-error" role="alert">{localError}</p>}
    <button type="button" className="wheel-spin" disabled={demo || spinning || !canSpin || !shown.length} onClick={() => void spin()}>{spinning ? 'Girando…' : 'Girar'}</button>
    {demo && <p className="wheel-note">La vista previa no gira la ruleta.</p>}
    {!!spins.length && <div className="wheel-history">{spins.map(spinRow => <p key={spinRow.id}><strong>{money(spinRow.amount)}</strong><span>{playerStatus[spinRow.status]}</span><small>{date(spinRow.credited_at || spinRow.created_at)}</small></p>)}</div>}
  </section>;
}

function recipeDrafts(): Draft[] {
  return defaultPrizes.map(prize => ({ key: String(prize.amount), amount: String(prize.amount), slots: String(prize.slots), active: true }));
}

export function WheelAdmin({ demo, busy, action, userId, superAdmin, canEditPrizes }: {
  demo: boolean; busy: boolean; userId: string; superAdmin: boolean; canEditPrizes: boolean;
  action: (task: () => Promise<void>) => Promise<void>;
}) {
  const { settings, reloadPromotions } = useContent();
  const visible = !!settings.wheel_enabled;
  const [tab, setTab] = useState<'prizes' | 'credit'>('credit');
  const [drafts, setDrafts] = useState<Draft[]>(recipeDrafts);
  const [status, setStatus] = useState<'pending' | 'credited'>('pending');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AdminSpin[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [reload, setReload] = useState(0);
  const [copied, setCopied] = useState('');
  const [note, setNote] = useState('');
  const parsed = parseDrafts(drafts);
  const summary = parsed.error ? null : wheelCycleSummary(parsed.active);

  useEffect(() => {
    if (demo || !supabase || !canEditPrizes) return;
    const db = supabase;
    void db.rpc('list_wheel_prizes').then(({ data, error }) => {
      if (error || !data?.length) return;
      setDrafts((data as Array<{ amount: number; slots: number; active: boolean }>).map(prize => ({
        key: String(prize.amount), amount: String(Number(prize.amount)), slots: String(prize.slots), active: prize.active,
      })));
    });
  }, [demo, canEditPrizes]);
  useEffect(() => {
    if (demo || !supabase || tab !== 'credit') return;
    const db = supabase;
    let alive = true;
    setLoading(true);
    setFailure('');
    void db.rpc('list_wheel_spins', { p_status: status, p_offset: page * 10 }).then(({ data, error }) => {
      if (!alive) return;
      setLoading(false);
      if (error) { setFailure(knownWheelError(error.message) || 'No pudimos consultar la ruleta.'); return; }
      const spins = ((data ?? []) as AdminSpin[]).map(row => ({ ...row, amount: Number(row.amount) }));
      if (!spins.length && page > 0) { setPage(value => value - 1); return; }
      setRows(spins);
      setTotal(Number(spins[0]?.total_count) || 0);
    });
    return () => { alive = false; };
  }, [demo, status, page, reload, tab]);
  useEffect(() => {
    if (demo || !supabase) return;
    const db = supabase;
    const refresh = () => setReload(value => value + 1);
    const channel = db.channel('admin-wheel-spins').on('postgres_changes', { event: '*', schema: 'public', table: 'wheel_spins' }, refresh).subscribe();
    window.addEventListener('focus', refresh);
    return () => { void db.removeChannel(channel); window.removeEventListener('focus', refresh); };
  }, [demo]);

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= drafts.length) return;
    setDrafts(current => {
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  }
  async function toggleVisible() {
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no prende la ruleta.');
      const { error } = await supabase.rpc('set_wheel_enabled', { p_enabled: !visible });
      if (error) throw new InputError(knownWheelError(error.message) || 'No pudimos cambiar la ruleta.');
      reloadPromotions();
      setNote(visible ? 'La ruleta quedó oculta. Los jugadores ya no la ven.' : 'La ruleta quedó visible para los jugadores.');
    });
  }
  async function save() {
    setNote('');
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no guarda la ruleta.');
      if (parsed.error) throw new InputError(parsed.error);
      const payload = drafts.map((draft, index) => ({
        amount: Number(draft.amount.trim().replace(/\./g, '')),
        slots: Number(draft.slots.trim()),
        active: draft.active,
        sort_order: index + 1,
      }));
      const { error } = await supabase.rpc('replace_wheel_prizes', { p_prizes: payload });
      if (error) throw new InputError(knownWheelError(error.message) || 'No pudimos guardar los premios.');
      setNote('Los premios quedaron guardados. Valen para los ciclos que todavía no empezaron.');
    });
  }
  async function updateSpin(name: 'reserve_wheel_spin' | 'release_wheel_spin' | 'credit_wheel_spin', row: AdminSpin) {
    if (name === 'credit_wheel_spin' && !window.confirm(`¿Ya acreditaste ${money(row.amount)} a ${row.username} en la plataforma externa? Confirmá únicamente después de realizar la carga.`)) return;
    if (name === 'release_wheel_spin' && !window.confirm('¿Confirmás que este premio NO se acreditó en la plataforma externa? Al liberar la reserva, otro operador podrá tomarlo.')) return;
    setNote('');
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no acredita premios.');
      const { data, error } = await supabase.rpc(name, { p_spin_id: parseUuid(row.id) });
      if (error) { setReload(value => value + 1); throw new InputError(knownWheelError(error.message) || 'No pudimos actualizar el premio.'); }
      setReload(value => value + 1);
      if (name !== 'credit_wheel_spin') return;
      const notificationId = (data as { notification_id?: string } | null)?.notification_id;
      if (!notificationId) { setNote('Premio acreditado.'); return; }
      const push = await supabase.functions.invoke('send-user-push', { body: { notification_id: notificationId } });
      if (push.error) setNote('Premio acreditado. El aviso quedó en la cuenta del usuario, pero el push no salió.');
      else if (push.data?.no_devices || !push.data?.sent) setNote('Premio acreditado. El aviso quedó en la cuenta del usuario.');
      else setNote('Premio acreditado. El usuario ya tiene el aviso.');
    });
  }
  async function copy(value: string, field: string) {
    await action(async () => { await navigator.clipboard.writeText(value); setCopied(field); });
  }

  return <section className="referral-admin wheel-admin" aria-labelledby="wheel-admin-title">
    <div className="referral-heading"><div><h2 id="wheel-admin-title"><Disc size={23} /> Ruleta</h2><p>Un giro cada 24 horas. El premio se acredita a mano, aparte de las cargas.</p></div><button type="button" disabled={busy || loading || demo} onClick={() => setReload(value => value + 1)}><RefreshCw size={17} />Actualizar</button></div>
    <div className="wheel-visibility">
      <button type="button" role="switch" aria-checked={visible} className={visible ? 'enabled' : ''} disabled={!canEditPrizes || busy} onClick={() => void toggleVisible()}><span />{visible ? 'Prendida para los jugadores' : 'Apagada para los jugadores'}</button>
      <p>{canEditPrizes ? 'Apagada, los jugadores no ven la ruleta. Prendela para que aparezca en el inicio.' : 'Solo quien edita los premios puede prender la ruleta.'}</p>
    </div>
    <div className="referral-filters" role="group" aria-label="Secciones de la ruleta">
      <button type="button" aria-pressed={tab === 'credit'} onClick={() => setTab('credit')}>Acreditación</button>
      <button type="button" aria-pressed={tab === 'prizes'} onClick={() => setTab('prizes')}>Premios</button>
    </div>
    {note && <p className="wheel-admin-note" role="status">{note}</p>}
    {tab === 'prizes' ? <div className="wheel-editor">
      <p className="referral-instructions">Cada espacio es una porción igual. El mismo monto se reparte en varias porciones, no queda en un solo bloque. Pausar lo saca de los ciclos nuevos y conserva lo ya ganado.</p>
      {!!parsed.active.length && <WheelDisc prizes={parsed.active} rotation={0} spinning={false} />}
      {parsed.error ? <p className="wheel-error" role="alert">{parsed.error}</p> : summary && <div className="wheel-summary">
        <p>Ciclo de {summary.total} giros · total {money(summary.cycleTotal)} · promedio {money(summary.average)}</p>
        <p>En 30 giros el jugador diario suma {money(summary.monthTotal)}.</p>
        {parsed.active.map(prize => {
          const times = timesLabel(summary.monthCount(prize.slots));
          return <p key={prize.amount}>{wheelAmountLabel(prize.amount)} × {prize.slots} · entra {times} {times === '1' ? 'vez' : 'veces'} en 30 giros</p>;
        })}
      </div>}
      <div className="wheel-drafts">{drafts.map((draft, index) => <div className="wheel-draft" key={draft.key}>
        <label>Monto<input inputMode="numeric" value={draft.amount} disabled={!canEditPrizes} onChange={event => setDrafts(current => current.map(item => item.key === draft.key ? { ...item, amount: event.target.value } : item))} /></label>
        <label>Espacios<input inputMode="numeric" value={draft.slots} disabled={!canEditPrizes} onChange={event => setDrafts(current => current.map(item => item.key === draft.key ? { ...item, slots: event.target.value } : item))} /></label>
        <label className="wheel-active"><input type="checkbox" checked={draft.active} disabled={!canEditPrizes} onChange={event => setDrafts(current => current.map(item => item.key === draft.key ? { ...item, active: event.target.checked } : item))} />Activo</label>
        <div className="wheel-draft-actions">
          <button type="button" disabled={!canEditPrizes || index === 0} onClick={() => move(index, -1)} aria-label="Subir premio">Subir</button>
          <button type="button" disabled={!canEditPrizes || index === drafts.length - 1} onClick={() => move(index, 1)} aria-label="Bajar premio">Bajar</button>
          <button type="button" disabled={!canEditPrizes || drafts.length === 1} onClick={() => setDrafts(current => current.filter(item => item.key !== draft.key))} aria-label="Quitar premio"><Trash2 size={15} /></button>
        </div>
      </div>)}</div>
      <div className="referral-reward-actions">
        <button type="button" disabled={!canEditPrizes || drafts.length >= 60} onClick={() => setDrafts(current => [...current, { key: crypto.randomUUID(), amount: '', slots: '1', active: true }])}><Plus size={16} />Agregar premio</button>
        {canEditPrizes && <button type="button" className="referral-confirm" disabled={busy || !!parsed.error} onClick={() => void save()}>Guardar premios</button>}
      </div>
      {!canEditPrizes && <p className="referral-instructions">Podés acreditar premios. Los montos los cambia un administrador de bonos.</p>}
    </div> : <>
      <p className="referral-instructions">Tomá el premio, copiá el usuario y el monto, y confirmá recién cuando la carga externa esté hecha.</p>
      <div className="referral-filters" role="group" aria-label="Estado de los premios">
        <button type="button" aria-pressed={status === 'pending'} onClick={() => { setStatus('pending'); setPage(0); }}>Pendientes</button>
        <button type="button" aria-pressed={status === 'credited'} onClick={() => { setStatus('credited'); setPage(0); }}>Acreditados</button>
      </div>
      {demo ? <p className="empty">Los premios de la ruleta se acreditan al trabajar con jugadores reales.</p> : loading ? <p className="empty" role="status">Cargando premios…</p> : failure ? <p className="empty" role="alert">{failure}</p> : !rows.length ? <p className="empty">No hay premios {status === 'pending' ? 'pendientes' : 'acreditados'}.</p> : <>
        <div className="referral-reward-list">{rows.map(row => {
          const mine = row.status === 'reserved' && row.reserved_by === userId;
          return <article className="referral-reward-card wheel-spin-card" key={row.id}>
            <header className="referral-pair-heading"><div><small>Ruleta</small><strong>{money(row.amount)}</strong></div><small>{date(row.created_at)}</small></header>
            <section className="referral-beneficiary">
              <div className="referral-beneficiary-user"><strong>{row.username}</strong><button type="button" disabled={busy} aria-label={`Copiar usuario ${row.username}`} onClick={() => void copy(row.username, `${row.id}-user`)}><Copy size={15} />{copied === `${row.id}-user` ? 'Copiado' : 'Copiar'}</button></div>
              <p className="referral-reward-state">{adminStatus[row.status]}{row.credited_at ? ` · ${date(row.credited_at)}` : ''}</p>
              {row.external_user_id && <p>ID plataforma: <strong>{row.external_user_id}</strong></p>}
              {mine && <div className="referral-copy-actions">{row.external_user_id && <button type="button" disabled={busy} onClick={() => void copy(row.external_user_id!, `${row.id}-external`)}><Copy size={15} />{copied === `${row.id}-external` ? 'ID copiado' : 'Copiar ID'}</button>}<button type="button" disabled={busy} onClick={() => void copy(String(Number(row.amount)), `${row.id}-amount`)}><Copy size={15} />{copied === `${row.id}-amount` ? 'Monto copiado' : 'Copiar monto'}</button></div>}
              <div className="referral-reward-actions">
                {row.status === 'pending' && <button type="button" disabled={busy} onClick={() => void updateSpin('reserve_wheel_spin', row)}>Tomar premio para acreditar</button>}
                {mine && <button type="button" className="referral-confirm" disabled={busy} onClick={() => void updateSpin('credit_wheel_spin', row)}>Ya acredité este premio</button>}
                {row.status === 'reserved' && !mine && <span>Reservado por otro operador</span>}
                {row.status === 'reserved' && (mine || superAdmin) && <button type="button" disabled={busy} onClick={() => void updateSpin('release_wheel_spin', row)}>Liberar sin acreditar</button>}
              </div>
            </section>
          </article>;
        })}</div>
        <div className="referral-pagination"><button type="button" disabled={busy || page === 0} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page + 1} de {Math.max(1, Math.ceil(total / 10))} · {total} premios</span><button type="button" disabled={busy || (page + 1) * 10 >= total} onClick={() => setPage(value => value + 1)}>Siguiente</button></div>
      </>}
    </>}
  </section>;
}
