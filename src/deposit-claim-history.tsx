import { useEffect, useState } from 'react';
import { date, supabase } from './lib';
import { publicError } from './security';

type Event = { event: string; actor_name: string; previous_name: string | null; next_name: string | null; reason: string | null; created_at: string };
const labels: Record<string, string> = { taken: 'Tomó la carga', released: 'Liberó la carga', reassigned: 'Reasignó la carga', approved: 'Aceptó la carga', rejected: 'Rechazó la carga', credited: 'Confirmó la acreditación' };

export function DepositClaimHistory({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Event[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !supabase) return;
    const controller = new AbortController();
    let alive = true;
    setLoading(true); setError(''); setRows([]);
    void (async () => {
      try {
        const { data, error } = await supabase!.rpc('list_deposit_claim_events', { p_request_id: requestId }).abortSignal(controller.signal);
        if (error) throw error;
        if (alive) setRows((data ?? []) as Event[]);
      } catch (cause) { if (alive) setError(publicError(cause)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; controller.abort(); };
  }, [open, requestId]);
  return <div className="deposit-claim-history"><button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Ocultar responsables' : 'Ver responsables y movimientos'}</button>{open && <div aria-live="polite">{loading ? <p>Cargando movimientos…</p> : error ? <p role="alert">{error}</p> : !rows.length ? <p>Sin movimientos de atención registrados.</p> : <ol>{rows.map((row, index) => <li key={index}><strong>{row.actor_name}</strong> · {labels[row.event] ?? row.event}<small>{date(row.created_at)}{row.previous_name && row.event === 'reassigned' ? ` · Antes: ${row.previous_name}` : ''}</small>{row.reason && <p>{row.reason}</p>}</li>)}</ol>}</div>}</div>;
}
