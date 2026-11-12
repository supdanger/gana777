import { useEffect, useRef, useState } from 'react';
import { date, money, supabase, type RequestRow } from './lib';
import { WITHDRAWAL_PAUSE_OPTIONS, validWithdrawalPause, type WithdrawalRejection } from './withdrawal-pause';
import './withdrawal-rejection.css';

export function WithdrawalRejectionDialog({ request, onConfirm, onClose }: {
  request: RequestRow; onConfirm: (request: RequestRow, options: WithdrawalRejection) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), lock = useRef(false);
  const [withPause, setWithPause] = useState(false);
  const [minutes, setMinutes] = useState<number>(15);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="withdrawal-rejection-dialog" aria-labelledby="withdrawal-rejection-title" onClose={onClose} onCancel={event => { if (lock.current) event.preventDefault(); }}>
    <form onSubmit={event => { event.preventDefault(); if (lock.current) return; if (reason.trim().length < 5) { setError('Escribí un motivo de al menos 5 caracteres.'); return; } if (withPause && !validWithdrawalPause(minutes)) { setError('Elegí uno de los cuatro plazos disponibles.'); return; } lock.current = true; setBusy(true); setError(''); void onConfirm(request, { reason: reason.trim(), minutes: withPause ? minutes as WithdrawalRejection['minutes'] : null }).then(result => { if (result.ok) dialog.current?.close(); else setError(result.error || 'No pudimos rechazar el retiro.'); }).catch(() => setError('No pudimos confirmar el rechazo. Revisá el estado antes de reintentar.')).finally(() => { lock.current = false; setBusy(false); }); }}>
      <header><div><h2 id="withdrawal-rejection-title">Rechazar retiro</h2><p>Elegí si corresponde aplicar una pausa adicional.</p></div><button type="button" disabled={busy} aria-label="Cerrar rechazo de retiro" onClick={() => dialog.current?.close()}>×</button></header>
      <div className="withdrawal-rejection-summary"><strong>{request.user_name || 'Jugador'}</strong><strong>{money(request.amount)}</strong></div>
      <label className="withdrawal-rejection-toggle"><input type="checkbox" disabled={busy} checked={withPause} onChange={e => setWithPause(e.target.checked)} /><span><strong>Pausar nuevas solicitudes de retiro</strong><small>Solo se aplicará si activás esta opción.</small></span></label>
      {withPause && <fieldset><legend>Duración de la pausa</legend><div className="withdrawal-rejection-options">{WITHDRAWAL_PAUSE_OPTIONS.map(option => <label key={option.minutes}><input type="radio" name="withdrawal-pause-minutes" disabled={busy} value={option.minutes} checked={minutes === option.minutes} onChange={() => setMinutes(option.minutes)} /><span>{option.label}</span></label>)}</div><p className="withdrawal-rejection-hint">La pausa empieza al confirmar. Se conservan las demás condiciones para solicitar un retiro.</p></fieldset>}
      <label className="withdrawal-rejection-reason" htmlFor="withdrawal-rejection-reason">Motivo del rechazo · lo verá el jugador</label><textarea id="withdrawal-rejection-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={240} disabled={busy} />
      {error && <p role="alert" className="withdrawal-rejection-error">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={() => dialog.current?.close()}>Cancelar</button><button type="submit" className="withdrawal-rejection-confirm" disabled={busy}>{busy ? 'Confirmando…' : withPause ? 'Rechazar y aplicar pausa' : 'Rechazar solicitud'}</button></footer>
    </form>
  </dialog>;
}

export function WithdrawalRejectionRecord({ requestId }: { requestId: string }) {
  const [record, setRecord] = useState<{ reason: string; minutes: number | null; paused_until: string | null; created_at: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (!supabase) return; const controller = new AbortController(); void supabase.from('withdrawal_rejections').select('reason,minutes,paused_until,created_at').eq('request_id', requestId).abortSignal(controller.signal).maybeSingle().then(result => { if (controller.signal.aborted) return; if (result.error) setError('No pudimos cargar el motivo del rechazo.'); else setRecord(result.data); }); return () => controller.abort(); }, [requestId]);
  if (error) return <p className="withdrawal-rejection-error">{error}</p>;
  if (!record) return null;
  return <section className="withdrawal-rejection-record"><strong>Motivo del rechazo</strong><p>{record.reason}</p><small>{date(record.created_at)} · {record.paused_until ? `Pausa hasta ${date(record.paused_until)}` : 'Sin pausa adicional'}</small></section>;
}
