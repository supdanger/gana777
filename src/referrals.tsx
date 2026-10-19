import { useEffect, useState } from 'react';
import { Copy, Gift, RefreshCw } from 'lucide-react';
import { InputError, parseUuid } from '../supabase/functions/_shared/validation';
import { date, money, supabase } from './lib';

type RewardStatus = 'pending' | 'reserved' | 'credited';
type Reward = {
  id: string; beneficiary_role: 'referrer' | 'referred'; amount: number; status: RewardStatus;
  created_at: string; credited_at: string | null;
};
type AdminReward = Reward & {
  beneficiary_user_id: string; username: string; external_user_id: string | null;
  referred_name: string; referrer_name: string; reserved_by: string | null; total_count: number;
};
const rewardStatus: Record<RewardStatus, string> = {
  pending: 'Pendiente de acreditación', reserved: 'En proceso de acreditación', credited: 'Acreditado',
};
const rewardErrors = new Set([
  'No tenés permiso para gestionar bonos de recomendación.',
  'No tenés permiso para acreditar bonos de recomendación.',
  'El bono ya fue acreditado o no existe.',
  'Otro operador está acreditando este bono.',
  'El bono ya no existe.',
  'No se puede liberar esta reserva.',
  'Tomá el bono antes de acreditar. Si está reservado, debe confirmarlo el mismo operador.',
]);

export function ReferralRewardsAdmin({ demo, busy, action, userId, superAdmin }: {
  demo: boolean; busy: boolean; userId: string; superAdmin: boolean;
  action: (task: () => Promise<void>) => Promise<void>;
}) {
  const [status, setStatus] = useState<'pending' | 'credited'>('pending');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AdminReward[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [reload, setReload] = useState(0);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (demo || !supabase) return;
    const db = supabase;
    let alive = true;
    setLoading(true);
    setFailure('');
    void db.rpc('list_referral_rewards', { p_status: status, p_offset: page * 10 }).then(({ data, error }) => {
      if (!alive) return;
      setLoading(false);
      if (error) { setFailure('No pudimos consultar los recomendados. Aplicá la migración 022 y revisá tus permisos.'); return; }
      const rewards = (data ?? []) as AdminReward[];
      if (!rewards.length && page > 0) { setPage(value => value - 1); return; }
      setRows(rewards);
      setTotal(Number(rewards[0]?.total_count) || 0);
    });
    return () => { alive = false; };
  }, [demo, status, page, reload]);

  useEffect(() => {
    if (demo || !supabase) return;
    const db = supabase;
    const refresh = () => setReload(value => value + 1);
    const channel = db.channel('admin-referral-rewards').on('postgres_changes', {
      event: '*', schema: 'public', table: 'referral_rewards',
    }, refresh).subscribe();
    window.addEventListener('focus', refresh);
    return () => { void db.removeChannel(channel); window.removeEventListener('focus', refresh); };
  }, [demo]);

  async function updateReward(name: 'reserve_referral_reward' | 'release_referral_reward' | 'mark_referral_reward_credited', row: AdminReward) {
    if (name === 'mark_referral_reward_credited' && !window.confirm(`¿Ya acreditaste ${money(row.amount)} a ${row.username} en la plataforma externa? Confirmá únicamente después de realizar la carga.`)) return;
    if (name === 'release_referral_reward' && !window.confirm('¿Confirmás que este bono NO se acreditó en la plataforma externa? Al liberar la reserva, otro operador podrá tomarlo.')) return;
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no acredita bonos.');
      const { error } = await supabase.rpc(name, { p_reward_id: parseUuid(row.id) });
      if (error) {
        setReload(value => value + 1);
        throw new InputError(rewardErrors.has(error.message) ? error.message : 'No pudimos actualizar el bono. Revisá el estado antes de acreditar.');
      }
      setReload(value => value + 1);
    });
  }
  async function copy(value: string, field: string) {
    await action(async () => { await navigator.clipboard.writeText(value); setCopied(field); });
  }

  return <section className="referral-admin" aria-labelledby="referral-rewards-title">
    <div className="referral-heading"><div><h2 id="referral-rewards-title"><Gift size={23} /> Recomendados</h2><p>Primera carga aprobada: {money(1000)} para quien recomienda y {money(1000)} para el nuevo jugador.</p></div><button type="button" disabled={busy || loading || demo} onClick={() => setReload(value => value + 1)}><RefreshCw size={17} />Actualizar</button></div>
    <p className="referral-instructions">Estos premios son adicionales a los bonos de carga. Tomá el bono, acreditalo en la plataforma externa y recién después confirmá la acreditación. No se carga dinero automáticamente desde esta web.</p>
    <p className="referral-instructions">Para generar premios, elegí «Recomendado por» al crear el jugador y aprobá su primera carga. En su tarjeta debe figurar el recomendador. Crear la cuenta o enviar una carga pendiente no genera premios; las cuentas sin recomendador no los generan.</p>
    <div className="referral-filters" role="group" aria-label="Estado de los premios">
      <button type="button" aria-pressed={status === 'pending'} onClick={() => { setStatus('pending'); setPage(0); }}>Pendientes</button>
      <button type="button" aria-pressed={status === 'credited'} onClick={() => { setStatus('credited'); setPage(0); }}>Acreditados</button>
    </div>
    {demo ? <p className="empty">Las recomendaciones y los premios se registran al trabajar con jugadores reales.</p> : loading ? <p className="empty" role="status">Cargando premios…</p> : failure ? <p className="empty" role="alert">{failure}</p> : !rows.length ? <p className="empty">No hay premios {status === 'pending' ? 'pendientes' : 'acreditados'}.</p> : <>
      <div className="referral-reward-list">{rows.map(row => {
        const mine = row.status === 'reserved' && row.reserved_by === userId;
        return <article className="referral-reward-card" key={row.id}>
          <div className="referral-reward-heading"><div><strong>{row.username}</strong><small>{row.beneficiary_role === 'referrer' ? 'Premio del recomendador' : 'Premio del recomendado'}</small></div><strong>{money(row.amount)}</strong></div>
          <p>{row.referrer_name} recomendó a {row.referred_name}.</p>
          <p className="referral-reward-state">{rewardStatus[row.status]} · {date(row.credited_at || row.created_at)}</p>
          {row.external_user_id && <p>ID plataforma: <strong>{row.external_user_id}</strong></p>}
          {mine && <div className="referral-copy-actions"><button type="button" disabled={busy} onClick={() => void copy(row.username, `${row.id}-user`)}><Copy size={15} />{copied === `${row.id}-user` ? 'Usuario copiado' : 'Copiar usuario'}</button>{row.external_user_id && <button type="button" disabled={busy} onClick={() => void copy(row.external_user_id!, `${row.id}-external`)}><Copy size={15} />{copied === `${row.id}-external` ? 'ID copiado' : 'Copiar ID'}</button>}<button type="button" disabled={busy} onClick={() => void copy(String(Number(row.amount)), `${row.id}-amount`)}><Copy size={15} />{copied === `${row.id}-amount` ? 'Monto copiado' : 'Copiar monto'}</button></div>}
          <div className="referral-reward-actions">
            {row.status === 'pending' && <button type="button" disabled={busy} onClick={() => void updateReward('reserve_referral_reward', row)}>Tomar bono para acreditar</button>}
            {mine && <button type="button" className="referral-confirm" disabled={busy} onClick={() => void updateReward('mark_referral_reward_credited', row)}>Ya acredité este bono</button>}
            {row.status === 'reserved' && !mine && <span>Reservado por otro operador</span>}
            {row.status === 'reserved' && (mine || superAdmin) && <button type="button" disabled={busy} onClick={() => void updateReward('release_referral_reward', row)}>Liberar sin acreditar</button>}
          </div>
        </article>;
      })}</div>
      <div className="referral-pagination"><button type="button" disabled={busy || page === 0} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page + 1} de {Math.max(1, Math.ceil(total / 10))} · {total} premios</span><button type="button" disabled={busy || (page + 1) * 10 >= total} onClick={() => setPage(value => value + 1)}>Siguiente</button></div>
    </>}
  </section>;
}

export function ReferralBonusHistory({ userId, demo }: { userId: string; demo: boolean }) {
  const [rows, setRows] = useState<Reward[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [failure, setFailure] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (demo || !supabase || !userId) return;
    const db = supabase;
    let alive = true;
    setLoading(true);
    void db.from('referral_rewards').select('id,beneficiary_role,amount,status,created_at,credited_at', { count: 'exact' })
      .eq('beneficiary_user_id', userId).order('created_at', { ascending: false }).order('id').range(page * 5, page * 5 + 4)
      .then(({ data, count, error }) => {
        if (!alive) return;
        setLoading(false); setFailure(!!error);
        if (!error) { setRows(data as Reward[]); setTotal(count ?? 0); }
      });
    return () => { alive = false; };
  }, [userId, demo, page, reload]);
  useEffect(() => {
    if (demo || !supabase || !userId) return;
    const db = supabase;
    const refresh = () => setReload(value => value + 1);
    const channel = db.channel(`my-referral-rewards-${userId}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'referral_rewards', filter: `beneficiary_user_id=eq.${userId}`,
    }, refresh).subscribe();
    window.addEventListener('focus', refresh);
    return () => { void db.removeChannel(channel); window.removeEventListener('focus', refresh); };
  }, [userId, demo]);
  if (demo || (!loading && !failure && !total)) return null;
  return <section className="card referral-player-history" aria-labelledby="referral-player-title"><h2 id="referral-player-title"><Gift size={21} /> Bonos por recomendaciones</h2>
    {loading ? <p role="status">Cargando bonos…</p> : failure ? <p role="alert">No pudimos consultar tus bonos. Intentá más tarde.</p> : <>
      {rows.map(row => <div className="referral-player-row" key={row.id}><div><strong>{money(Number(row.amount))}</strong><small>{row.beneficiary_role === 'referrer' ? 'Por recomendar a un jugador' : 'Por tu primera carga como recomendado'}</small><small>{date(row.credited_at || row.created_at)}</small></div><span>{rewardStatus[row.status]}</span></div>)}
      {total > 5 && <div className="referral-pagination"><button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Anterior</button><span>{page + 1} / {Math.ceil(total / 5)}</span><button type="button" disabled={(page + 1) * 5 >= total} onClick={() => setPage(value => value + 1)}>Siguiente</button></div>}
    </>}
  </section>;
}

export function ApprovedReferralNotice({ requestId }: { requestId: string }) {
  const [generated, setGenerated] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    setGenerated(false);
    void supabase.from('referral_rewards').select('id', { count: 'exact', head: true }).eq('source_request_id', requestId)
      .then(({ count }) => { if (alive) setGenerated((count ?? 0) > 0); });
    return () => { alive = false; };
  }, [requestId]);
  return generated ? <p className="approved-referral-notice"><Gift size={18} />Esta carga generó dos premios de {money(1000)}: uno para cada jugador. Se acreditan por separado desde Recomendados, en Usuarios o Bonos; no están incluidos en el total de esta carga.</p> : null;
}
