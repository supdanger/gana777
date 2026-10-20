import { useState } from 'react';
import { Check, Clock3, Copy, WalletCards } from 'lucide-react';
import { date, money, type RequestRow } from './lib';

type ReviewStatus = 'approved' | 'rejected';

export function AdminWithdrawals({ requests, busy, demo, onReview }: {
  requests: RequestRow[];
  busy: boolean;
  demo: boolean;
  onReview: (request: RequestRow, status: ReviewStatus) => void;
}) {
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState('');
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

  function field(request: RequestRow, label: string, value: string | null, key: string, canCopy = true) {
    const fieldKey = `${request.id}-${key}`;
    return <div className="withdrawal-field" key={key}>
      <span>{label}</span>
      <div><strong>{value || 'No informado'}</strong>{value && canCopy && <button type="button" aria-label={`Copiar ${label.toLowerCase()} de ${request.user_name || 'usuario'}`} onClick={() => void copy(value, fieldKey)}>{copied === fieldKey ? <Check size={16} /> : <Copy size={16} />}{copied === fieldKey ? 'Copiado' : 'Copiar'}</button>}</div>
    </div>;
  }

  function card(request: RequestRow) {
    const isPending = request.status === 'pending';
    return <article className={`withdrawal-review-card${isPending ? ' is-pending' : ''}`} key={request.id}>
      <header className="withdrawal-review-header"><div><span className={`badge ${request.status}`}>{isPending ? 'Pendiente' : request.status === 'approved' ? 'Acreditado' : 'Rechazado'}</span><small>Solicitado el {date(request.created_at)}</small></div><strong>{money(request.amount)}</strong></header>
      <div className="withdrawal-review-fields">
        {field(request, 'Nombre de usuario', request.user_name, 'user')}
        {field(request, 'Titular de la cuenta', request.holder, 'holder', false)}
        {field(request, 'CBU / CVU', request.cbu, 'cbu')}
        {field(request, 'Alias', request.alias, 'alias')}
      </div>
      {isPending && <footer className="withdrawal-review-actions"><p>Verificá los datos y confirmá solo después de acreditar el dinero.</p><div><button className="withdrawal-approve" type="button" disabled={busy || demo} onClick={() => { if (window.confirm(`¿Confirmás que acreditaste ${money(request.amount)} a ${request.user_name || 'este usuario'}?`)) onReview(request, 'approved'); }}>Confirmar acreditación</button><button className="withdrawal-reject" type="button" disabled={busy || demo} onClick={() => { if (window.confirm('¿Confirmás que querés rechazar este retiro?')) onReview(request, 'rejected'); }}>Rechazar retiro</button></div></footer>}
    </article>;
  }

  return <div className="admin-withdrawals">
    <div className="withdrawal-page-heading"><div><h1>Retiros</h1><p>Revisá los datos de la cuenta antes de acreditar cada solicitud.</p></div><strong>{pending.length} pendientes</strong></div>
    {copyError && <p className="alert error" role="alert">{copyError}</p>}
    <section aria-labelledby="withdrawals-pending-title"><h2 id="withdrawals-pending-title"><Clock3 size={22} /> Pendientes <span>{pending.length}</span></h2>{pending.length ? <div className="withdrawal-review-list">{pending.map(card)}</div> : <p className="card empty">No hay retiros pendientes.</p>}</section>
    <section aria-labelledby="withdrawals-resolved-title"><h2 id="withdrawals-resolved-title"><WalletCards size={22} /> Resueltos <span>{resolved.length}</span></h2>{resolved.length ? <div className="withdrawal-review-list">{resolved.map(card)}</div> : <p className="card empty">Todavía no hay retiros resueltos.</p>}</section>
  </div>;
}
