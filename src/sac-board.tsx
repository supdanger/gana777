import { useCallback, useEffect, useState } from 'react';
import { InputError } from '../supabase/functions/_shared/validation.ts';
import { date, supabase } from './lib';
import { shiftLabel, type ShiftKey } from './shifts';
import {
  demoSacPhones, mergePhoneOptions, parseOperatorName, phonesFromAccounts, readSacBoard, stationsOrDefaults, telegramShiftSentence,
  type SacPhoneOption, type SacStation,
} from './sac';

function shiftName(key: string | null) {
  return key && key in shiftLabel ? shiftLabel[key as ShiftKey].toLowerCase() : '';
}

function SacCard({
  station, phones, owners, local, busy, onUseHere, onStart, onEnd, onToggle,
}: {
  station: SacStation;
  phones: readonly SacPhoneOption[];
  owners: ReadonlyMap<number, number>;
  local: boolean;
  busy: boolean;
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
    {open ? <p>Elegí los teléfonos de este SAC.</p> : <p>Iniciá el turno para elegir teléfonos. Los que ya están quedan en este SAC.</p>}
    <div className="sac-phone-list" role="group" aria-label={`Teléfonos de SAC ${station.number}`}>
      {phones.length ? phones.map(phone => {
        const owner = owners.get(phone.phone) ?? null;
        const selected = owner === station.number;
        const takenBy = owner !== null && owner !== station.number ? owner : null;
        return <button type="button" key={phone.phone} className={selected ? 'selected' : ''} aria-pressed={selected} disabled={busy || !open || takenBy !== null} onClick={() => onToggle(phone.phone)}>
          <strong>Teléfono {phone.phone}</strong>
          <small>{phone.holders.join(', ') || 'Sin titular'}</small>
          {takenBy !== null ? <em>SAC {takenBy}</em> : phone.on_shift === false ? <em>En otro turno</em> : phone.active_count === 0 ? <em>Sin cuentas activas</em> : null}
        </button>;
      }) : <p>Guardá el número en cada cuenta, desde Cuentas, para ver los teléfonos acá.</p>}
    </div>
  </article>;
}

export function SacBoard({
  demo, busy, action, scope, station, onStation,
}: {
  demo: boolean;
  busy: boolean;
  action: (task: () => Promise<void>) => Promise<void>;
  scope: 'all' | 'local';
  station: number | null;
  onStation: (station: number) => void;
}) {
  const [stations, setStations] = useState<SacStation[]>(() => stationsOrDefaults([]));
  const [phones, setPhones] = useState<SacPhoneOption[]>(demo ? demoSacPhones : []);
  const [activeShift, setActiveShift] = useState<string | null>(demo ? 'morning' : null);
  const [loading, setLoading] = useState(!demo && !!supabase);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const visible = scope === 'local' ? stations.filter(item => item.number === station) : stations;
  const owners = new Map(stations.flatMap(item => item.phones.map(phone => [phone, item.number] as const)));

  const reload = useCallback(async () => {
    if (demo || !supabase) return;
    const db = supabase;
    const [boardResult, accountResult] = await Promise.all([
      db.rpc('get_sac_board'),
      db.from('bank_accounts').select('phone_number,holder,active,shift_key'),
    ]);
    if (boardResult.error) throw boardResult.error;
    const board = readSacBoard(boardResult.data);
    const listed = accountResult.error || !accountResult.data ? [] : phonesFromAccounts(accountResult.data, board.active_shift);
    setActiveShift(board.active_shift);
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
        <p>{activeShift ? `El turno en línea es ${shiftName(activeShift)}. Elegí los teléfonos físicos: cada número junta las cuentas que lo tienen.` : 'No hay un turno en línea. Podés abrir el puesto y elegir teléfonos.'} Hasta que un SAC tenga teléfonos, los jugadores siguen recibiendo cualquier cuenta activa del turno.</p>
      </div>
    </div>
    {loadError ? <div className="alert error" role="alert">{loadError}</div> : null}
    {notice ? <div className="alert" role="status">{notice}</div> : null}
    {scope === 'local' ? <div className="sac-picker" role="group" aria-label="Elegir el SAC de esta computadora">
      {stations.map(item => <button type="button" key={item.number} className={station === item.number ? 'active' : ''} aria-pressed={station === item.number} onClick={() => onStation(item.number)}>SAC {item.number}</button>)}
    </div> : null}
    {loading ? <p className="empty">Cargando SAC…</p> : scope === 'local' && !station ? <p className="empty">Elegí el SAC de esta computadora para ver sus cargas.</p> : <div className="sac-grid">
      {visible.map(item => <SacCard key={item.number} station={item} phones={phones} owners={owners} local={station === item.number} busy={busy} onUseHere={() => onStation(item.number)} onStart={name => start(item.number, name)} onEnd={() => end(item.number)} onToggle={phone => toggle(item.number, phone)} />)}
    </div>}
  </section>;
}
