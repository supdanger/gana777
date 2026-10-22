import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { InputError } from '../supabase/functions/_shared/validation.ts';
import { BankTransferCard } from './bank-transfer-card';
import { date, supabase, type Bank } from './lib';
import { shiftLabel, type ShiftKey } from './shifts';
import {
  demoSacPhones, mergePhoneOptions, parseOperatorName, phonesForShift, phonesFromAccounts, readSacBoard, sacAccountBadge, stationsOrDefaults, telegramShiftSentence,
  type SacPhoneAccount, type SacPhoneOption, type SacStation,
} from './sac';

function shiftName(key: string | null) {
  return key && key in shiftLabel ? shiftLabel[key as ShiftKey].toLowerCase() : '';
}

function cardBank(account: SacPhoneAccount): Omit<Bank, 'assignment_id'> {
  return {
    id: account.id,
    bank: account.bank,
    holder: account.holder,
    cbu: account.cbu || '0000',
    alias: account.alias,
    theme_key: account.theme_key ?? undefined,
    theme_background_path: account.theme_background_path,
    theme_logo_path: account.theme_logo_path,
  };
}

function accountCount(phone: SacPhoneOption) {
  const count = phone.accounts?.length || phone.holders.length;
  return count === 1 ? '1 cuenta' : `${count} cuentas`;
}

function SacPhoneList({
  stationNumber, phones, owners, open, busy, activeShift, onToggle,
}: {
  stationNumber: number;
  phones: readonly SacPhoneOption[];
  owners: ReadonlyMap<number, number>;
  open: boolean;
  busy: boolean;
  activeShift: string | null;
  onToggle: (phone: number) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  if (!phones.length) return <p>{activeShift ? 'Este turno no tiene cuentas con teléfono.' : 'Cuando haya un turno en línea, acá aparecen solo sus cuentas.'}</p>;
  return <div className="sac-phone-list" role="list" aria-label={`Teléfonos de SAC ${stationNumber}`}>
    {phones.map(phone => {
      const owner = owners.get(phone.phone) ?? null;
      const selected = owner === stationNumber;
      const takenBy = owner !== null && owner !== stationNumber ? owner : null;
      const isOpen = expanded === phone.phone;
      const accounts = phone.accounts ?? [];
      const panelId = `sac-${stationNumber}-phone-${phone.phone}`;
      return <article className={`sac-phone-fold${selected ? ' is-selected' : ''}${takenBy !== null ? ' is-taken' : ''}`} key={phone.phone} role="listitem">
        <div className="sac-phone-fold-bar">
          <button type="button" className="sac-phone-fold-toggle" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setExpanded(isOpen ? null : phone.phone)}>
            <span className="sac-phone-index" aria-hidden="true">{phone.phone}</span>
            <span className="sac-phone-copy"><strong>Teléfono {phone.phone}</strong><small>{accounts.length ? accountCount(phone) : phone.holders.join(', ') || accountCount(phone)}</small></span>
            <ChevronDown size={18} className={isOpen ? 'is-open' : ''} aria-hidden="true" />
          </button>
          <button type="button" className="sac-phone-choose" aria-pressed={selected} disabled={busy || !open || takenBy !== null} onClick={() => { setExpanded(phone.phone); onToggle(phone.phone); }}>
            {takenBy !== null ? `SAC ${takenBy}` : selected ? 'En este SAC' : 'Elegir'}
          </button>
        </div>
        {isOpen ? <div id={panelId} className="sac-phone-accounts">
          {accounts.length ? <div className="withdrawal-source-grid">{accounts.map(account => {
            const badge = sacAccountBadge(account, activeShift);
            return <article className="withdrawal-source-card" key={account.id}>
              <BankTransferCard bank={cardBank(account)} compact />
              <div className={`withdrawal-source-state sac-account-state is-${badge.tone}${badge.tone === 'paused' ? ' is-cooling' : ''}`}><span>{badge.label}</span></div>
            </article>;
          })}</div> : <p>{phone.holders.join(', ') || 'Este teléfono no tiene cuentas cargadas.'}</p>}
        </div> : null}
      </article>;
    })}
  </div>;
}

function SacCard({
  station, phones, owners, local, busy, activeShift, onUseHere, onStart, onEnd, onToggle,
}: {
  station: SacStation;
  phones: readonly SacPhoneOption[];
  owners: ReadonlyMap<number, number>;
  local: boolean;
  busy: boolean;
  activeShift: string | null;
  onUseHere: () => void;
  onStart: (name: string) => void;
  onEnd: () => void;
  onToggle: (phone: number) => void;
}) {
  const open = Boolean(station.started_at && station.operator_name);
  return <article className={`sac-card${open ? ' open' : ''}${local ? ' local' : ''}`}>
    <header>
      <div>
        <small>{local ? 'ESTA COMPUTADORA' : open ? 'TURNO ABIERTO' : 'LIBRE'}</small>
        <strong>SAC {station.number}</strong>
      </div>
      <button type="button" className={local ? 'active' : ''} onClick={onUseHere}>{local ? 'Esta computadora' : 'Usar en esta computadora'}</button>
    </header>
    {open ? <div className="sac-operator">
      <div><strong>{station.operator_name}</strong>{station.started_at && <small>Desde {date(station.started_at)}</small>}</div>
      <button type="button" disabled={busy} onClick={onEnd}>Finalizar turno</button>
    </div> : <form className="sac-start" onSubmit={event => { event.preventDefault(); onStart(String(new FormData(event.currentTarget).get('operator_name') ?? '')); }}>
      <label>Nombre<input name="operator_name" maxLength={40} placeholder="Ejemplo: Max" autoComplete="name" /></label>
      <button type="submit" disabled={busy}>Iniciar turno</button>
    </form>}
    {open ? <p>Abrí un teléfono para ver sus cuentas y elegilo para este SAC.</p> : <p>Iniciá el turno para elegir teléfonos. Los que ya están quedan en este SAC.</p>}
    <SacPhoneList stationNumber={station.number} phones={phones} owners={owners} open={open} busy={busy} activeShift={activeShift} onToggle={onToggle} />
  </article>;
}

export function SacBoard({
  demo, busy, action, scope, station, onStation, liveShift,
}: {
  demo: boolean;
  busy: boolean;
  action: (task: () => Promise<void>) => Promise<void>;
  scope: 'all' | 'local';
  station: number | null;
  onStation: (station: number) => void;
  liveShift?: string | null;
}) {
  const [stations, setStations] = useState<SacStation[]>(() => stationsOrDefaults([]));
  const [phones, setPhones] = useState<SacPhoneOption[]>(demo ? demoSacPhones : []);
  const [loadedShift, setLoadedShift] = useState<string | null>(demo ? 'morning' : null);
  const activeShift = liveShift === undefined ? loadedShift : liveShift;
  const shownPhones = phonesForShift(phones, activeShift);
  const [loading, setLoading] = useState(!demo && !!supabase);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const visible = scope === 'local' ? stations.filter(item => item.number === station) : stations;
  const owners = new Map(stations.flatMap(item => item.phones.map(phone => [phone, item.number] as const)));

  const reload = useCallback(async () => {
    if (demo || !supabase) return;
    const db = supabase;
    const [boardResult, accountResult, themeResult, statusResult] = await Promise.all([
      db.rpc('get_sac_board'),
      db.from('bank_accounts').select('id,bank,holder,cbu,alias,theme_key,active,shift_key,phone_number'),
      db.from('bank_themes').select('key,background_path,logo_path'),
      db.rpc('get_bank_operation_status').single(),
    ]);
    if (boardResult.error) throw boardResult.error;
    const board = readSacBoard(boardResult.data);
    const operation = statusResult.error ? null : statusResult.data as { active_shift_key?: string | null } | null;
    const shift = typeof operation?.active_shift_key === 'string' ? operation.active_shift_key : board.active_shift;
    const themes = new Map((themeResult.error ? [] : themeResult.data ?? []).map(theme => [String(theme.key), theme]));
    const rows = (accountResult.error ? [] : accountResult.data ?? []).map(row => {
      const theme = themes.get(String(row.theme_key ?? ''));
      return { ...row, theme_background_path: theme?.background_path ?? null, theme_logo_path: theme?.logo_path ?? null };
    });
    const listed = rows.length ? phonesFromAccounts(rows, shift) : [];
    setLoadedShift(shift);
    setStations(stationsOrDefaults(board.stations));
    setPhones(mergePhoneOptions(listed, board.phones));
    setLoadError('');
  }, [demo]);

  useEffect(() => {
    if (demo || !supabase) { setLoading(false); return; }
    const db = supabase;
    let alive = true;
    const load = () => {
      void reload().catch(() => { if (alive) setLoadError('No pudimos cargar los SAC. Aplicá la migración 038 y actualizá el panel.'); }).finally(() => { if (alive) setLoading(false); });
    };
    load();
    const channel = db.channel(`sac-board-${scope}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sac_stations' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sac_phones' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_operation_state' }, load)
      .subscribe();
    return () => { alive = false; void db.removeChannel(channel); };
  }, [demo, reload, scope]);

  function applyDemo(next: SacStation[]) { setStations(stationsOrDefaults(next)); }

  async function notify(eventId: string, verb: 'iniciado' | 'finalizado') {
    if (!supabase) return telegramShiftSentence(verb, null, true);
    const { data, error } = await supabase.functions.invoke('notify-sac-shift', { body: { event_id: eventId } });
    return telegramShiftSentence(verb, error ? null : data as { delivered?: boolean; reason?: string }, !!error);
  }

  function start(number: number, rawName: string) {
    void action(async () => {
      const name = parseOperatorName(rawName);
      if (demo || !supabase) {
        if (stations.some(item => item.number === number && item.started_at)) throw new InputError('Ese SAC ya tiene un turno abierto.');
        applyDemo(stations.map(item => item.number === number ? { ...item, operator_name: name, started_at: new Date().toISOString() } : item));
        setNotice('Turno iniciado en la vista previa. En el panel, el mismo botón avisa por Telegram.');
        return;
      }
      const { data, error } = await supabase.rpc('start_sac_shift', { p_sac: number, p_name: name }).single();
      const created = data as { event_id?: string } | null;
      if (error || !created?.event_id) throw error ?? new InputError('No pudimos abrir el turno.');
      await reload();
      setNotice(await notify(created.event_id, 'iniciado'));
    });
  }

  function end(number: number) {
    const current = stations.find(item => item.number === number);
    if (!current?.operator_name || !window.confirm(`¿Finalizar el turno de ${current.operator_name} en SAC ${number}?`)) return;
    void action(async () => {
      if (demo || !supabase) {
        applyDemo(stations.map(item => item.number === number ? { ...item, operator_name: null, started_at: null } : item));
        setNotice('Turno finalizado en la vista previa. Los teléfonos quedan en este SAC.');
        return;
      }
      const { data, error } = await supabase.rpc('end_sac_shift', { p_sac: number }).single();
      const closed = data as { event_id?: string } | null;
      if (error || !closed?.event_id) throw error ?? new InputError('No pudimos finalizar el turno.');
      await reload();
      setNotice(await notify(closed.event_id, 'finalizado'));
    });
  }

  function toggle(number: number, phone: number) {
    const current = stations.find(item => item.number === number);
    if (!current?.started_at) return;
    const owner = owners.get(phone);
    if (owner && owner !== number) return;
    const next = current.phones.includes(phone) ? current.phones.filter(item => item !== phone) : [...current.phones, phone].sort((left, right) => left - right);
    void action(async () => {
      if (demo || !supabase) {
        applyDemo(stations.map(item => item.number === number ? { ...item, phones: next } : item));
        return;
      }
      const { error } = await supabase.rpc('set_sac_phones', { p_sac: number, p_phones: next });
      if (error) throw error;
      await reload();
    });
  }

  return <section className={`sac-board ${scope}`} aria-label={scope === 'local' ? 'SAC de esta computadora' : undefined} aria-labelledby={scope === 'all' ? 'sac-title' : undefined}>
    <div className="account-heading">
      <div>
        <h2 id={scope === 'all' ? 'sac-title' : undefined}>{scope === 'all' ? 'Puestos SAC' : 'SAC de esta computadora'}</h2>
        <p>{activeShift ? `El turno en línea es ${shiftName(activeShift)}. Cada teléfono muestra solo las cuentas de ese turno.` : 'No hay un turno en línea. Cuando se active, cada teléfono muestra solo las cuentas de ese turno.'} Hasta que un SAC tenga teléfonos, los jugadores siguen recibiendo cualquier cuenta activa del turno.</p>
      </div>
    </div>
    {loadError ? <div className="alert error" role="alert">{loadError}</div> : null}
    {notice ? <div className="alert" role="status">{notice}</div> : null}
    {scope === 'local' ? <div className="sac-picker" role="group" aria-label="Elegir el SAC de esta computadora">
      {stations.map(item => <button type="button" key={item.number} className={station === item.number ? 'active' : ''} aria-pressed={station === item.number} onClick={() => onStation(item.number)}>SAC {item.number}</button>)}
    </div> : null}
    {loading ? <p className="empty">Cargando SAC…</p> : scope === 'local' && !station ? <p className="empty">Elegí el SAC de esta computadora para ver sus cargas.</p> : <div className="sac-grid">
      {visible.map(item => <SacCard key={item.number} station={item} phones={shownPhones} owners={owners} local={station === item.number} busy={busy} activeShift={activeShift} onUseHere={() => onStation(item.number)} onStart={name => start(item.number, name)} onEnd={() => end(item.number)} onToggle={phone => toggle(item.number, phone)} />)}
    </div>}
  </section>;
}
