import { CheckCircle2, ChevronDown, History, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { readRequestPage } from './request-data';
import { date, money, type RequestRow } from './lib';
import { useAdminRefreshVersion } from './admin-refresh';

type Snapshot = { userId: string; rows: RequestRow[]; total: number; deposit: number; withdrawal: number };

function OperationDetails({ row }: { row: RequestRow }) {
  const status = row.status === 'pending' ? 'Pendiente' : row.status === 'rejected' ? (row.kind === 'deposit' ? 'Rechazada' : 'Rechazado') : row.kind === 'withdrawal' ? 'Aprobado' : row.credited_at ? 'Acreditada' : row.credited_at === null ? 'Por acreditar' : 'Aprobada';
  return <article className="attention-operation">
    <div className="attention-operation-heading"><span>{row.kind === 'deposit' ? 'Carga' : 'Retiro'}</span><span className={`attention-operation-status is-${status === 'Por acreditar' ? 'pending' : row.status}`}>{status}</span></div>
    <strong className="attention-operation-amount">{money(row.amount)}</strong><time dateTime={row.created_at}>Solicitado el {date(row.created_at)}</time>
    <details><summary>Ver detalle</summary><dl>
      <dt>Referencia</dt><dd>{row.id}</dd>
      <dt>Estado</dt><dd>{status}</dd>
      {row.approved_at && <><dt>Aprobación</dt><dd>{date(row.approved_at)}</dd></>}
      {row.credited_at && <><dt>Acreditación confirmada</dt><dd>{date(row.credited_at)}</dd></>}
      {(row.holder || row.deposit_holder) && <><dt>Titular</dt><dd>{row.kind === 'deposit' ? row.deposit_holder || row.holder : row.holder}</dd></>}
      {row.alias && <><dt>Alias</dt><dd>{row.alias}</dd></>}
      {row.cbu && <><dt>CBU / CVU</dt><dd>{row.cbu}</dd></>}
      {row.kind === 'deposit' && (row.bonus_id || row.bonus_percent > 0 || row.bonus_reward_label) && <><dt>Bono solicitado</dt><dd>{row.bonus_reward_label || `${row.bonus_percent}%`}{row.bonus_amount ? ` · ${money(row.bonus_amount)}` : ''}</dd></>}
    </dl></details>
  </article>;
}

function RecentOperations({ userId, canDeposit, canWithdrawal, demo }: {
  userId: string; canDeposit: boolean; canWithdrawal: boolean; demo: boolean;
}) {
  const [kind, setKind] = useState<RequestRow['kind']>(canDeposit ? 'deposit' : 'withdrawal');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ rows: RequestRow[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const refresh = useAdminRefreshVersion();
  const allowed = kind === 'deposit' ? canDeposit : canWithdrawal;
  useEffect(() => {
    setResult(null); setError(''); setLoading(true);
    if (demo || !allowed) { setLoading(false); return; }
    const controller = new AbortController();
    void readRequestPage({ userId, kind, size: 5, page, signal: controller.signal }).then(next => {
      if (controller.signal.aborted) return;
      const lastPage = Math.max(0, Math.ceil(next.total / 5) - 1);
      if (page > lastPage) { setPage(lastPage); return; }
      setResult(next); setLoading(false);
    }).catch(() => { if (!controller.signal.aborted) { setError('No pudimos cargar el historial.'); setLoading(false); } });
    return () => controller.abort();
  }, [userId, kind, page, demo, allowed, refresh, retry]);
  return <div className="attention-recent-operations">
    {canDeposit && canWithdrawal && <div className="attention-history-types" role="group" aria-label="Tipo de operación del historial">{(['deposit', 'withdrawal'] as const).map(value => <button type="button" key={value} aria-pressed={kind === value} onClick={() => { if (kind === value) return; setResult(null); setLoading(true); setKind(value); setPage(0); }}>{value === 'deposit' ? 'Cargas' : 'Retiros'}</button>)}</div>}
    {demo ? <p>El historial real se muestra al iniciar sesión.</p> : !allowed ? <p>No tenés permiso para consultar estas operaciones.</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Reintentar historial</button></div> : loading || !result ? <p role="status">Cargando historial…</p> : <>
      <p className="attention-history-caption">{result.total} {kind === 'deposit' ? 'cargas' : 'retiros'} · Más recientes primero.</p>
      {result.rows.length ? result.rows.map(row => <OperationDetails key={row.id} row={row} />) : <p className="attention-empty-history">{kind === 'deposit' ? 'Este jugador todavía no tiene cargas.' : 'Este jugador todavía no tiene retiros.'}</p>}
      {result.total > 5 && <div className="attention-history-pager"><button type="button" disabled={page === 0} onClick={() => { setLoading(true); setPage(value => value - 1); }}>Anterior</button><span>{page + 1} de {Math.ceil(result.total / 5)}</span><button type="button" disabled={(page + 1) * 5 >= result.total} onClick={() => { setLoading(true); setPage(value => value + 1); }}>Siguiente</button></div>}
    </>}
  </div>;
}

export function AttentionPlayerContext({ userId, username, demo, canDeposit, canWithdrawal }: {
  userId: string; username: string; demo: boolean; canDeposit: boolean; canWithdrawal: boolean;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const refresh = useAdminRefreshVersion();
  useEffect(() => {
    setSnapshot(null); setError('');
    if (demo || (!canDeposit && !canWithdrawal)) return;
    const controller = new AbortController();
    const kinds = (['deposit', 'withdrawal'] as const).filter(kind => kind === 'deposit' ? canDeposit : canWithdrawal);
    void Promise.all(kinds.map(kind => readRequestPage({ userId, kind, status: 'pending', size: 3, ascending: true, signal: controller.signal })))
      .then(results => { if (!controller.signal.aborted) setSnapshot({ userId, rows: results.flatMap(result => result.rows), total: results.reduce((sum, result) => sum + result.total, 0), deposit: results[kinds.indexOf('deposit')]?.total ?? 0, withdrawal: results[kinds.indexOf('withdrawal')]?.total ?? 0 }); })
      .catch(() => { if (!controller.signal.aborted) setError('No pudimos consultar las operaciones.'); });
    return () => controller.abort();
  }, [userId, demo, canDeposit, canWithdrawal, refresh, retry]);
  const current = snapshot?.userId === userId ? snapshot : null;
  return <aside className="attention-player-context" aria-label="Datos del jugador">
    <header className="attention-player-heading"><span className="attention-player-icon"><UserRound size={21} aria-hidden="true" /></span><div><h2>Datos del jugador</h2><strong>{username}</strong></div></header>
    <section className="attention-pending-section" aria-label="Operaciones pendientes"><h3>Pendientes</h3>
    {!canDeposit && !canWithdrawal ? <p>No tenés permisos para consultar operaciones.</p> : demo ? <p>Las operaciones reales se muestran al iniciar sesión.</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Reintentar</button></div> : !current ? <p role="status">Consultando operaciones…</p> : <>
      <div className="attention-pending-counts">{canDeposit && <div><span>Cargas</span><strong>{current.deposit}</strong></div>}{canWithdrawal && <div><span>Retiros</span><strong>{current.withdrawal}</strong></div>}</div>
      {!current.total && <p className="attention-no-pending"><CheckCircle2 size={18} aria-hidden="true" /><span>No hay operaciones pendientes.</span></p>}
      {current.rows.map(row => <OperationDetails key={row.id} row={row} />)}
      {current.total > current.rows.length && <small>Se muestran hasta 3 pendientes por tipo, los más antiguos primero.</small>}
    </>}
    </section>
    {(canDeposit || canWithdrawal) && <section className="attention-history" aria-label="Historial del jugador"><button type="button" aria-expanded={historyOpen} aria-controls="player-chat-operation-history" onClick={() => setHistoryOpen(value => !value)}><History size={17} aria-hidden="true" /><span>{historyOpen ? 'Cerrar historial' : 'Ver historial'}</span><ChevronDown size={16} aria-hidden="true" /></button>
      <div id="player-chat-operation-history" hidden={!historyOpen}>{historyOpen && <RecentOperations userId={userId} canDeposit={canDeposit} canWithdrawal={canWithdrawal} demo={demo} />}</div>
    </section>}
  </aside>;
}
