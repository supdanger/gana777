import { useEffect, useState, type FormEvent } from 'react';
import { InputError } from '../supabase/functions/_shared/validation';
import { supabase, type BankOperationStatus } from './lib';
import { SacBoard } from './sac-board';
import { shifts, shiftLabel, type ShiftKey } from './shifts';

type ShiftRow = { key: ShiftKey; label: string; active: boolean; updated_at: string };
const previewNotice = 'La vista previa no modifica el estado de las cuentas.';

function countdown(deadline: string | null, now: number) {
  const seconds = deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) : 0;
  return [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}
function label(key: string | null) { return key && key in shiftLabel ? shiftLabel[key as ShiftKey] : 'Sin turno'; }

export function ShiftAdmin({ demo, busy, action, station, onStation }: { demo: boolean; busy: boolean; action: (task: () => Promise<void>) => Promise<void>; station: number | null; onStation: (station: number) => void }) {
  const previewRows = shifts.map((shift, index) => ({ ...shift, active: index === 0, updated_at: new Date().toISOString() }));
  const [rows, setRows] = useState<ShiftRow[]>(demo ? previewRows : []);
  const [status, setStatus] = useState<BankOperationStatus | null>(demo ? { mode: 'online', resumes_at: null, outgoing_shift_key: null, next_shift_key: null, active_shift_key: 'morning' } : null);
  const [loading, setLoading] = useState(!demo && !!supabase);
  const [loadError, setLoadError] = useState('');
  const [now, setNow] = useState(Date.now);

  async function loadState() {
    if (!supabase) return;
    const [shiftResult, statusResult] = await Promise.all([
      supabase.from('work_shifts').select('key,label,active,updated_at'),
      supabase.rpc('get_bank_operation_status').single(),
    ]);
    if (shiftResult.error || statusResult.error) throw shiftResult.error ?? statusResult.error;
    setRows((shiftResult.data ?? []) as ShiftRow[]);
    setStatus(statusResult.data as BankOperationStatus);
  }

  useEffect(() => {
    if (demo || !supabase) { setLoading(false); return; }
    let alive = true;
    void loadState().catch(() => { if (alive) setLoadError('No pudimos cargar el control de turnos. Aplicá la migración de cierre de caja.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [demo]);
  useEffect(() => {
    if (status?.mode !== 'closing') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status?.mode]);
  useEffect(() => {
    if (status?.mode !== 'closing' || !status.resumes_at || Date.parse(status.resumes_at) > now || demo) return;
    void loadState().catch(() => setLoadError('No pudimos actualizar el turno automáticamente.'));
  }, [now, status, demo]);

  async function activate(key: ShiftKey) {
    await action(async () => {
      if (demo || !supabase) throw new InputError(previewNotice);
      const { error } = await supabase.rpc('set_active_shift', { p_shift: key });
      if (error) throw error;
      await loadState();
    });
  }
  async function startClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const minutes = Number(form.get('minutes'));
    const nextShift = form.get('next_shift');
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10) { setLoadError('El cierre debe durar entre 1 y 10 minutos.'); return; }
    if (!shifts.some(shift => shift.key === nextShift)) { setLoadError('Elegí el turno que ingresará.'); return; }
    await action(async () => {
      if (demo || !supabase) throw new InputError(previewNotice);
      const { error } = await supabase.rpc('start_cash_close', { p_minutes: minutes, p_next_shift: nextShift });
      if (error) throw error;
      setNow(Date.now());
      await loadState();
    });
  }
  async function startMaintenance() {
    if (!window.confirm('¿Activar mantenimiento? Ningún usuario nuevo recibirá una cuenta hasta que actives un turno.')) return;
    await action(async () => {
      if (demo || !supabase) throw new InputError(previewNotice);
      const { error } = await supabase.rpc('start_bank_maintenance');
      if (error) throw error;
      await loadState();
    });
  }

  const activeKey = status?.active_shift_key as ShiftKey | null;
  const suggestedNext = shifts.find(shift => shift.key !== activeKey)?.key ?? 'afternoon';
  return <section className="shift-admin" aria-labelledby="shift-title">
    <div className="account-heading"><div><h1 id="shift-title">Turnos</h1><p>Controlá las cuentas en línea, el cierre de caja y mantenimiento.</p></div></div>
    {loadError && <div className="alert error" role="alert">{loadError}</div>}
    {loading ? <p className="empty">Cargando turnos…</p> : <>
      <article className={`operation-status ${status?.mode ?? 'online'}`}>
        <div><small>ESTADO ACTUAL</small><strong>{status?.mode === 'closing' ? 'Cierre de caja' : status?.mode === 'maintenance' ? 'Mantenimiento' : 'Cuentas en línea'}</strong>
          <p>{status?.mode === 'closing' ? `${label(status.outgoing_shift_key)} finalizó · después ingresa ${label(status.next_shift_key)}` : status?.mode === 'maintenance' ? 'Todas las cuentas permanecen fuera de línea.' : `${label(status?.active_shift_key ?? null)} está atendiendo.`}</p></div>
        {status?.mode === 'closing' && <div className="operation-countdown"><strong>{countdown(status.resumes_at, now)}</strong><small>para volver</small></div>}
      </article>

      {status?.mode === 'closing' ? <div className="operation-actions"><button disabled={busy} onClick={() => void activate(status.next_shift_key as ShiftKey)}>Activar {label(status.next_shift_key)} ahora</button><button className="maintenance-button" disabled={busy} onClick={() => void startMaintenance()}>Pasar a mantenimiento</button></div> : <form className="cash-close-form" onSubmit={startClose}>
        <div><strong>Modo cierre de caja</strong><p>Detiene cuentas nuevas y activa automáticamente el próximo turno.</p></div>
        <label><span className="cash-close-label">Tiempo</span><span className="cash-close-duration"><input name="minutes" type="number" min="1" max="10" step="1" defaultValue="5" required /><small>minutos</small></span></label>
        <label><span className="cash-close-label">Próximo turno</span><select name="next_shift" defaultValue={suggestedNext}>{shifts.map(shift => <option value={shift.key} key={shift.key}>{shift.label}</option>)}</select></label>
        <button disabled={busy || status?.mode === 'maintenance'}>Iniciar cierre</button>
      </form>}

      {status?.mode === 'maintenance' ? <div className="maintenance-resume"><strong>Elegí el turno que vuelve en línea</strong><div>{shifts.map(shift => <button disabled={busy} key={shift.key} onClick={() => void activate(shift.key)}>Activar {shift.label}</button>)}</div></div> : status?.mode !== 'closing' && <button className="maintenance-button full" disabled={busy} onClick={() => void startMaintenance()}>Activar modo mantenimiento</button>}

      <div className="shift-switches">
        {shifts.map(definition => {
          const row = rows.find(item => item.key === definition.key);
          const active = row?.active ?? false;
          return <article className={`shift-switch${active ? ' active' : ''}`} key={definition.key}>
            <div><small>{active ? 'EN FUNCIONAMIENTO' : 'DESACTIVADO'}</small><strong>{definition.label}</strong><p>{active ? 'Sus cuentas están siendo asignadas.' : 'Sus cuentas quedan guardadas para este turno.'}</p></div>
            <button type="button" role="switch" aria-checked={active} disabled={busy || active || status?.mode !== 'online'} onClick={() => void activate(definition.key)}><span />{active ? 'Activo' : 'Activar turno'}</button>
          </article>;
        })}
      </div>
      <SacBoard demo={demo} busy={busy} action={action} scope="all" station={station} onStation={onStation} liveShift={status?.active_shift_key ?? null} />
      <p className="shift-note">Las asignaciones entregadas antes del cierre continúan disponibles para que esos usuarios puedan enviar su comprobante.</p>
    </>}
  </section>;
}
