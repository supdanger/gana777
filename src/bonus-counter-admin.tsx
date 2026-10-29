import { useCallback, useEffect, useState } from 'react';
import { Archive, RotateCcw } from 'lucide-react';
import { supabase, money } from './lib';
import type { BonusCounter } from './bonus-counters';

type CounterRow = BonusCounter & { rewardType: 'cash' | 'free_spins'; rewardLabel: string; freeSpins: number };
type Summary = { counters: CounterRow[]; totalLoads: number; withoutBonus: number; totalBonusGranted: number; freeSpinsGranted: number };
type ShiftReport = { id: number; started_at: string; ended_at: string; summary: Summary };
type Dashboard = { active: { id: number; started_at: string; summary: Summary }; history: ShiftReport[] };
const emptySummary: Summary = { counters: [], totalLoads: 0, withoutBonus: 0, totalBonusGranted: 0, freeSpinsGranted: 0 };

function dateTime(value: string) {
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
function asSummary(value: unknown): Summary {
  if (!value || typeof value !== 'object') return emptySummary;
  const row = value as Partial<Summary>;
  return {
    counters: Array.isArray(row.counters) ? row.counters : [],
    totalLoads: Number(row.totalLoads) || 0,
    withoutBonus: Number(row.withoutBonus) || 0,
    totalBonusGranted: Number(row.totalBonusGranted) || 0,
    freeSpinsGranted: Number(row.freeSpinsGranted) || 0,
  };
}

export function BonusCounterAdmin({ demo, demoCounters = [] }: { demo: boolean; demoCounters?: BonusCounter[] }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!supabase || demo) return;
    const { data, error: rpcError } = await supabase.rpc('get_bonus_counter_dashboard');
    if (rpcError) throw rpcError;
    const value = data as { active?: { id?: number; started_at?: string; summary?: unknown }; history?: ShiftReport[] } | null;
    if (!value?.active?.id || !value.active.started_at) throw new Error('No encontramos el turno activo.');
    setDashboard({
      active: { id: Number(value.active.id), started_at: value.active.started_at, summary: asSummary(value.active.summary) },
      history: Array.isArray(value.history) ? value.history : [],
    });
  }, [demo]);

  useEffect(() => {
    if (demo || !supabase) { setLoading(false); return; }
    let alive = true;
    void refresh().catch(() => { if (alive) setError('No pudimos cargar los contadores por turno. Aplicá la migración 074.'); }).finally(() => { if (alive) setLoading(false); });
    const channel = supabase.channel('bonus-counter-shifts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => { void refresh().catch(() => undefined); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_counter_shifts' }, () => { void refresh().catch(() => undefined); })
      .subscribe();
    return () => { alive = false; void supabase?.removeChannel(channel); };
  }, [demo, refresh]);

  async function closeShift() {
    if (!supabase || busy || !window.confirm('¿Guardar el resumen de este turno e iniciar un turno nuevo?')) return;
    setBusy(true); setError(''); setNotice('');
    const { error: closeError } = await supabase.rpc('close_bonus_counter_shift');
    if (closeError) setError(closeError.message || 'No pudimos cerrar el turno.');
    else { setNotice('Turno guardado. Los contadores empezaron de cero.'); await refresh().catch(() => setError('El turno se guardó, pero no pudimos actualizar la vista.')); }
    setBusy(false);
  }

  const activeSummary = demo
    ? (() => {
      return { counters: demoCounters.map(item => ({ ...item, rewardType: 'cash' as const, rewardLabel: '', freeSpins: 0 })), totalLoads: demoCounters.reduce((sum, item) => sum + item.loads, 0), withoutBonus: demoCounters.find(item => item.key === 'none')?.loads ?? 0, totalBonusGranted: demoCounters.reduce((sum, item) => sum + (item.key === 'none' ? 0 : item.bonusTotal), 0), freeSpinsGranted: 0 };
    })()
    : dashboard?.active.summary ?? emptySummary;

  return <section className="bonus-counters bonus-shift-board" aria-label="Contadores de bonos por turno">
    <div className="bonus-shift-heading"><div><h2>Bonos del turno</h2><p>{demo ? 'Vista previa' : dashboard ? `Abierto desde ${dateTime(dashboard.active.started_at)}` : 'Cargando turno…'}</p></div>
      {!demo && <button type="button" className="bonus-shift-close" disabled={busy || loading || !dashboard} onClick={() => void closeShift()}><RotateCcw size={16} /> {busy ? 'Guardando…' : 'Cerrar y guardar turno'}</button>}
    </div>
    {error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert success" role="status">{notice}</p>}
    {loading ? <p className="bonus-shift-loading">Cargando contadores…</p> : <>
      <div className="bonus-counter-grid">
        {activeSummary.counters.map(item => <article className="card" key={item.key}><p>{item.title}</p><strong>{item.loads}</strong><small>{item.rewardType === 'free_spins' ? `${item.freeSpins} giros gratis${item.rewardLabel ? ` · ${item.rewardLabel}` : ''}` : item.key === 'none' ? 'Sin bono' : money(item.bonusTotal)}</small></article>)}
        <article className="card"><p>Total cargas</p><strong>{activeSummary.totalLoads}</strong><small>Sin bono: {activeSummary.withoutBonus}</small></article>
        <article className="card bonus-total-awarded"><p>Total bonos otorgados</p><strong>{money(activeSummary.totalBonusGranted)}</strong><small>{activeSummary.freeSpinsGranted} premios de giros gratis</small></article>
      </div>
    </>}
    <details className="bonus-shift-history">
      <summary><Archive size={16} /> Turnos guardados <span>{dashboard?.history.length ?? 0}</span></summary>
      {dashboard?.history.length ? <div className="bonus-shift-history-list">{dashboard.history.map(shift => <details className="bonus-shift-report" key={shift.id}>
        <summary><span><strong>{dateTime(shift.started_at)} – {dateTime(shift.ended_at)}</strong><small>{shift.summary.totalLoads} cargas · {shift.summary.withoutBonus} sin bono</small></span><b>{money(shift.summary.totalBonusGranted)}</b></summary>
        <div>{shift.summary.counters.map(counter => <p key={counter.key}><span>{counter.title} · {counter.loads}</span><strong>{counter.rewardType === 'free_spins' ? `${counter.freeSpins} giros gratis` : money(counter.bonusTotal)}</strong></p>)}<p className="bonus-shift-report-total"><span>Total bonos otorgados</span><strong>{money(shift.summary.totalBonusGranted)}</strong></p></div>
      </details>)}</div> : <p className="bonus-shift-history-empty">Todavía no hay turnos cerrados.</p>}
    </details>
  </section>;
}
