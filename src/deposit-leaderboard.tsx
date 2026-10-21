import { useEffect, useState } from 'react';
import { Award, CalendarDays, Crown, Medal } from 'lucide-react';
import type { RequestRow } from './lib';
import { money, supabase } from './lib';

type Period = 'day' | 'week' | 'month';
type Leader = { user_id: string; user_name: string; total_amount: number; load_count: number };
const periods: { key: Period; label: string }[] = [
  { key: 'day', label: 'Hoy' },
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mes' },
];

function demoLeaders(requests: RequestRow[], period: Period): Leader[] {
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const start = period === 'day'
    ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
    : period === 'week'
      ? weekStart.getTime()
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const groups = new Map<string, Leader>();
  requests.filter(row => row.kind === 'deposit' && row.status === 'approved' && Date.parse(row.created_at) >= start).forEach(row => {
    const leader = groups.get(row.user_id) ?? { user_id: row.user_id, user_name: row.user_name || 'Jugador', total_amount: 0, load_count: 0 };
    leader.total_amount += Number(row.amount) || 0;
    leader.load_count += 1;
    groups.set(row.user_id, leader);
  });
  return [...groups.values()].sort((a, b) => b.total_amount - a.total_amount || b.load_count - a.load_count).slice(0, 10);
}

export function DepositLeaderboard({ demo, requests, reloadKey }: { demo: boolean; requests: RequestRow[]; reloadKey: number }) {
  const [period, setPeriod] = useState<Period>('month');
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState('');

  useEffect(() => {
    if (demo) {
      setLeaders(demoLeaders(requests, period));
      setLoading(false);
      setError('');
      return;
    }
    if (!supabase) { setLoading(false); setError('No se pudo conectar con el ranking.'); return; }
    let alive = true;
    setLoading(true);
    setError('');
    void supabase.rpc('get_deposit_leaderboard', { p_period: period }).then(({ data, error: queryError }) => {
      if (!alive) return;
      if (queryError) { setLeaders([]); setError('No pudimos cargar el ranking. Aplicá la migración 030 y volvé a intentar.'); }
      else setLeaders(((data ?? []) as Leader[]).map(row => ({ ...row, total_amount: Number(row.total_amount) || 0, load_count: Number(row.load_count) || 0 })));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [demo, period, requests, reloadKey]);

  return <section className="deposit-leaderboard" aria-labelledby="deposit-leaderboard-title">
    <div className="deposit-leaderboard-heading">
      <div><h2 id="deposit-leaderboard-title"><Award size={20} /><span>Top jugadores</span></h2></div>
      <div className="deposit-leaderboard-tabs" role="tablist" aria-label="Período del ranking">
        {periods.map(item => <button type="button" role="tab" aria-selected={period === item.key} className={period === item.key ? 'active' : ''} key={item.key} onClick={() => setPeriod(item.key)}><CalendarDays size={14} />{item.label}</button>)}
      </div>
    </div>
    {loading ? <p className="deposit-leaderboard-empty">Cargando ranking…</p> : error ? <p className="deposit-leaderboard-empty" role="alert">{error}</p> : !leaders.length ? <p className="deposit-leaderboard-empty">Todavía no hay cargas acreditadas en este período.</p> : <ol className="deposit-leaderboard-list">
      {leaders.map((leader, index) => <li key={leader.user_id} className={index < 3 ? `top-${index + 1}` : ''}>
        <span className="deposit-leaderboard-rank">{index === 0 ? <Crown size={17} /> : index === 1 ? <Medal size={17} /> : index === 2 ? <Medal size={17} /> : index + 1}</span>
        <span className="deposit-leaderboard-player"><strong>{leader.user_name}</strong><small>{leader.load_count} {leader.load_count === 1 ? 'carga acreditada' : 'cargas acreditadas'}</small></span>
        <strong className="deposit-leaderboard-total">{money(leader.total_amount)}</strong>
      </li>)}
    </ol>}
  </section>;
}
