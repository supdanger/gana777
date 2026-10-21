import { useState } from 'react';
import { Check, Clock3, Copy, Eye, WalletCards } from 'lucide-react';
import { date, money, type RequestRow, type WithdrawalPart } from './lib';
import { compressReceipt } from './image-compression';

type ReviewStatus = 'rejected';

export function AdminWithdrawals({ requests, parts, busy, demo, onReview, onPay, onViewReceipt }: {
  requests: RequestRow[];
  parts: WithdrawalPart[];
  busy: boolean;
  demo: boolean;
  onReview: (request: RequestRow, status: ReviewStatus) => void;
  onPay: (request: RequestRow, part: WithdrawalPart, file: File) => void;
  onViewReceipt: (part: WithdrawalPart) => void;
}) {
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState('');
  const [receiptFiles, setReceiptFiles] = useState<Record<string, File>>({});
  const [receiptError, setReceiptError] = useState('');
  const [preparing, setPreparing] = useState('');
  const withdrawals = requests.filter(request => request.kind === 'withdrawal');
  const pending = withdrawals.filter(request => request.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at));
  const resolved = withdrawals.filter(request => request.status !== 'pending').sort((a, b) => b.created_at.localeCompare(a.created_at));

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setCopyError('');
    } catch {
      setCopyError('No se pudo copiar. Intentá nuevamente.');
    }
  }

  async function selectReceipt(key: string, file: File | undefined) {
    if (!file) return;
    setPreparing(key);
    setReceiptError('');
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Elegí una foto JPG, PNG o WebP.');
      const prepared = await compressReceipt(file);
      setReceiptFiles(old => ({ ...old, [key]: prepared }));
    } catch (error) {
      setReceiptFiles(old => { const next = { ...old }; delete next[key]; return next; });
      setReceiptError(error instanceof Error ? error.message : 'No pudimos preparar el comprobante.');
    } finally { setPreparing(''); }
  }

  function field(request: RequestRow, label: string, value: string | null, key: string, canCopy = true) {
    const fieldKey = `${request.id}-${key}`;
    return <div className="withdrawal-field" key={key}>
      <span>{label}</span>
      <div><strong>{value || 'No informado'}</strong>{value && canCopy && <button type="button" aria-label={`Copiar ${label.toLowerCase()} de ${request.user_name || 'usuario'}`} onClick={() => void copy(value, fieldKey)}>{copied === fieldKey ? <Check size={16} /> : <Copy size={16} />}{copied === fieldKey ? 'Copiado' : 'Copiar'}</button>}</div>
    </div>;
  }

  function card(request: RequestRow) {
    const isPending = request.status === 'pending';
    const payments = parts.filter(part => part.request_id === request.id).sort((a, b) => a.part_number - b.part_number);
    const paid = payments.filter(part => part.paid_at);
    return <article className={`withdrawal-review-card${isPending ? ' is-pending' : ''}`} key={request.id}>
      <header className="withdrawal-review-header"><div><span className={`badge ${request.status}`}>{isPending ? 'Pendiente' : request.status === 'approved' ? 'Acreditado' : 'Rechazado'}</span><small>Solicitado el {date(request.created_at)}</small></div><strong>{money(request.amount)}</strong></header>
      <div className="withdrawal-review-fields">
        {field(request, 'Nombre de usuario', request.user_name, 'user')}
        {field(request, 'Titular de la cuenta', request.holder, 'holder', false)}
        {field(request, 'CBU / CVU', request.cbu, 'cbu')}
        {field(request, 'Alias', request.alias, 'alias')}
      </div>
      {payments.length > 0 && <section className="withdrawal-parts" aria-label={`Pagos del retiro de ${request.user_name || 'usuario'}`}>
        <div className="withdrawal-parts-heading"><strong>Transferencias</strong><span>{paid.length} de {payments.length} acreditadas · {money(paid.reduce((sum, part) => sum + Number(part.amount), 0))} de {money(request.amount)}</span></div>
        {payments.map(part => {
          const key = `${request.id}-${part.part_number}`;
          const file = receiptFiles[key];
          return <div className="withdrawal-part" key={part.part_number}>
            <div><strong>Retiro {part.part_number} de {payments.length}</strong><span>{money(Number(part.amount))}</span><small>{part.paid_at ? `Realizado el ${date(part.paid_at)}` : 'Pendiente de transferencia'}</small></div>
            {part.paid_at ? <button type="button" onClick={() => onViewReceipt(part)}><Eye size={16} /> Ver comprobante</button> : isPending && <div className="withdrawal-part-actions">
              <label className="withdrawal-file-picker">{file?.name || 'Elegir comprobante'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || demo || !!preparing} onChange={event => void selectReceipt(key, event.target.files?.[0])} /></label>
              <button type="button" className="withdrawal-approve" disabled={busy || demo || !!preparing || !file} onClick={() => { if (file && window.confirm(`¿Confirmás que transferiste ${money(Number(part.amount))} y que este es su comprobante?`)) onPay(request, part, file); }}>{preparing === key ? 'Preparando…' : 'Confirmar pago'}</button>
            </div>}
          </div>;
        })}
      </section>}
      {isPending && payments.length === 0 && <p className="withdrawal-parts-missing">No se generaron los pagos de este retiro. Revisá la migración de retiros antes de acreditarlo.</p>}
      {isPending && <footer className="withdrawal-review-actions"><p>{paid.length ? 'El retiro seguirá en proceso hasta completar todos los pagos.' : 'Verificá los datos antes de transferir. Cada pago requiere su comprobante.'}</p>{paid.length === 0 && <div><button className="withdrawal-reject" type="button" disabled={busy || demo} onClick={() => { if (window.confirm('¿Confirmás que querés rechazar este retiro?')) onReview(request, 'rejected'); }}>Rechazar retiro</button></div>}</footer>}
    </article>;
  }

  return <div className="admin-withdrawals">
    <div className="withdrawal-page-heading"><div><h1>Retiros</h1><p>Revisá los datos de la cuenta antes de acreditar cada solicitud.</p></div><strong>{pending.length} pendientes</strong></div>
    {copyError && <p className="alert error" role="alert">{copyError}</p>}
    {receiptError && <p className="alert error" role="alert">{receiptError}</p>}
    <section aria-labelledby="withdrawals-pending-title"><h2 id="withdrawals-pending-title"><Clock3 size={22} /> Pendientes <span>{pending.length}</span></h2>{pending.length ? <div className="withdrawal-review-list">{pending.map(card)}</div> : <p className="card empty">No hay retiros pendientes.</p>}</section>
    <section aria-labelledby="withdrawals-resolved-title"><h2 id="withdrawals-resolved-title"><WalletCards size={22} /> Resueltos <span>{resolved.length}</span></h2>{resolved.length ? <div className="withdrawal-review-list">{resolved.map(card)}</div> : <p className="card empty">Todavía no hay retiros resueltos.</p>}</section>
  </div>;
}
