import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { Check, ChevronRight, ClipboardPaste, Clock3, Copy, Eye, WalletCards, X } from 'lucide-react';
import { date, money, type RequestRow, type WithdrawalPart } from './lib';
import { compressReceipt } from './image-compression';
import { BankTransferCard } from './bank-transfer-card';
import { supabase, type BankOperationStatus } from './lib';
import { cooldownLabel, cooldownSeconds, type WithdrawalSourceAccount } from './withdrawal-sources';

type ReviewStatus = 'rejected';
const PAGE_SIZE = 10;

export function AdminWithdrawals({ requests, parts, busy, demo, onReview, onPay, onViewReceipt }: {
  requests: RequestRow[];
  parts: WithdrawalPart[];
  busy: boolean;
  demo: boolean;
  onReview: (request: RequestRow, status: ReviewStatus) => void;
  onPay: (request: RequestRow, part: WithdrawalPart, file: File, sourceAccount: WithdrawalSourceAccount) => Promise<{ ok: boolean; error?: string }>;
  onViewReceipt: (part: WithdrawalPart) => void;
}) {
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState('');
  const [receiptFiles, setReceiptFiles] = useState<Record<string, File>>({});
  const [receiptError, setReceiptError] = useState('');
  const [preparing, setPreparing] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<{ url: string; name: string; number: number; total: number; amount: number } | null>(null);
  const [pendingPage, setPendingPage] = useState(0);
  const [resolvedPage, setResolvedPage] = useState(0);
  const [sourceAccounts, setSourceAccounts] = useState<WithdrawalSourceAccount[]>([]);
  const [sourceStatus, setSourceStatus] = useState<BankOperationStatus | null>(null);
  const [sourceLoading, setSourceLoading] = useState(!demo);
  const [sourceError, setSourceError] = useState('');
  const [serverOffset, setServerOffset] = useState(0);
  const [paymentSelection, setPaymentSelection] = useState<{ requestId: string; partNumber: number } | null>(null);
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [now, setNow] = useState(Date.now);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const inspectionTrigger = useRef<HTMLButtonElement | null>(null);
  const inspectionRef = useRef(inspection);
  const selectionRef = useRef(paymentSelection);
  const busyRef = useRef(busy);
  inspectionRef.current = inspection;
  selectionRef.current = paymentSelection;
  busyRef.current = busy;
  const withdrawals = requests.filter(request => request.kind === 'withdrawal');
  const pending = withdrawals.filter(request => request.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at));
  const resolved = withdrawals.filter(request => request.status !== 'pending').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const selected = withdrawals.find(request => request.id === selectedId);

  useEffect(() => {
    if (!selectedId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (inspectionRef.current) setInspection(null);
        else if (selectionRef.current) { if (!busyRef.current) setPaymentSelection(null); }
        else setSelectedId(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      trigger.current?.focus();
    };
  }, [selectedId]);

  useEffect(() => () => {
    if (inspection) {
      URL.revokeObjectURL(inspection.url);
      inspectionTrigger.current?.focus();
    }
  }, [inspection]);

  async function loadSources() {
    if (demo || !supabase) { setSourceLoading(false); return; }
    const [accounts, status] = await Promise.all([
      supabase.rpc('get_withdrawal_source_accounts'),
      supabase.rpc('get_bank_operation_status').single(),
    ]);
    setSourceLoading(false);
    if (accounts.error || status.error) {
      setSourceError('No pudimos cargar las cuentas de este turno. Actualizá el panel e intentá nuevamente.');
      setSourceAccounts([]);
      return;
    }
    setSourceError('');
    const rows = (accounts.data ?? []) as WithdrawalSourceAccount[];
    if (rows[0]?.server_now) setServerOffset(Date.parse(rows[0].server_now) - Date.now());
    setSourceAccounts(rows);
    setSourceStatus(status.data as BankOperationStatus);
  }

  useEffect(() => {
    void loadSources();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const refresh = window.setInterval(() => void loadSources(), 15000);
    const onFocus = () => void loadSources();
    window.addEventListener('focus', onFocus);
    const channel = !demo && supabase ? supabase.channel('withdrawal-sources')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'withdrawal_parts' }, () => void loadSources())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bank_operation_state' }, () => void loadSources())
      .subscribe() : null;
    return () => { window.clearInterval(clock); window.clearInterval(refresh); window.removeEventListener('focus', onFocus); if (channel) void supabase?.removeChannel(channel); };
  }, [demo]);

  const serverTime = now + serverOffset;
  const banks = Array.from(new Set(sourceAccounts.map(account => account.bank))).sort((a, b) => a.localeCompare(b, 'es'));
  const paymentRequest = withdrawals.find(request => request.id === paymentSelection?.requestId);
  const paymentPart = parts.find(part => part.request_id === paymentSelection?.requestId && part.part_number === paymentSelection?.partNumber);
  const paymentFile = paymentSelection ? receiptFiles[`${paymentSelection.requestId}-${paymentSelection.partNumber}`] : undefined;
  const selectedSource = sourceAccounts.find(account => account.id === selectedSourceId);

  function openPaymentSelection(request: RequestRow, part: WithdrawalPart) {
    setPaymentError(''); setSelectedBank(''); setSelectedSourceId('');
    setPaymentSelection({ requestId: request.id, partNumber: part.part_number });
    void loadSources();
  }

  async function confirmPayment() {
    if (!paymentRequest || !paymentPart || !paymentFile || !selectedSource || busy) return;
    if (cooldownSeconds(selectedSource, Date.now() + serverOffset) > 0) { setPaymentError('La cuenta sigue en enfriamiento. Elegí otra.'); return; }
    if (!window.confirm(`¿Confirmás que transferiste ${money(Number(paymentPart.amount))} desde ${selectedSource.bank} · ${selectedSource.alias} y que el comprobante corresponde a este pago?`)) return;
    setPaymentError('');
    const result = await onPay(paymentRequest, paymentPart, paymentFile, selectedSource);
    await loadSources();
    if (result.ok) { setPaymentSelection(null); setSelectedBank(''); setSelectedSourceId(''); }
    else setPaymentError(result.error || 'No pudimos confirmar el pago. Revisá la cuenta e intentá nuevamente.');
  }

  function closeDetail() {
    setInspection(null);
    setPaymentSelection(null);
    setSelectedId(null);
  }

  function inspectReceipt(event: MouseEvent<HTMLButtonElement>, file: File, number: number, total: number, amount: number) {
    inspectionTrigger.current = event.currentTarget;
    setInspection({ url: URL.createObjectURL(file), name: file.name, number, total, amount });
  }

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

  async function pasteReceipt(key: string) {
    if (busy || demo || preparing) return;
    try {
      if (!navigator.clipboard?.read) throw new Error('Portapapeles no disponible.');
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(value => ['image/jpeg', 'image/png', 'image/webp'].includes(value));
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
        await selectReceipt(key, new File([blob], `captura-pegada.${extension}`, { type }));
        return;
      }
      setReceiptError('No hay una imagen en el portapapeles. Copiá la captura y volvé a intentar.');
    } catch {
      setReceiptError('No pudimos leer el portapapeles. Seleccioná «Pegar» y presioná Ctrl+V, o elegí la foto.');
    }
  }

  function onPasteReceipt(event: ClipboardEvent<HTMLDivElement>, key: string) {
    if (busy || demo || preparing) return;
    const file = Array.from(event.clipboardData.items).map(item => item.getAsFile()).find(item => item?.type.startsWith('image/'));
    if (!file) { setReceiptError('No hay una imagen copiada. Copiá la captura y volvé a pegarla.'); return; }
    event.preventDefault();
    void selectReceipt(key, file);
  }

  function onDropReceipt(event: DragEvent<HTMLLabelElement>, key: string) {
    event.preventDefault();
    if (busy || demo || preparing) return;
    const file = event.dataTransfer.files[0];
    if (!file) { setReceiptError('Arrastrá una foto JPG, PNG o WebP.'); return; }
    void selectReceipt(key, file);
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
      <header className="withdrawal-review-header"><div><span className={`badge ${request.status}`}>{isPending ? 'En proceso' : request.status === 'approved' ? 'Realizado' : 'Rechazado'}</span><small>Solicitado el {date(request.created_at)}</small></div><strong>{money(request.amount)}</strong></header>
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
            <div><strong>Retiro {part.part_number} de {payments.length}</strong><span>{money(Number(part.amount))}</span><small>{part.paid_at ? `Realizado el ${date(part.paid_at)}` : 'Pendiente de transferencia'}</small>{part.source_bank_name && <small>Desde {part.source_bank_name}{part.source_alias ? ` · ${part.source_alias}` : ''}</small>}</div>
            {part.paid_at ? <button type="button" onClick={() => onViewReceipt(part)}><Eye size={16} /> Ver comprobante</button> : isPending && <div className="withdrawal-part-actions" onPaste={event => onPasteReceipt(event, key)}>
              <label className="withdrawal-file-picker" onDragOver={event => event.preventDefault()} onDrop={event => onDropReceipt(event, key)}>{file?.name || 'Elegir o arrastrar foto'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || demo || !!preparing} onChange={event => void selectReceipt(key, event.target.files?.[0])} /></label>
              <button type="button" className="withdrawal-paste" title="También podés presionar Ctrl+V sobre este botón" disabled={busy || demo || !!preparing} onClick={() => void pasteReceipt(key)}><ClipboardPaste size={16} /> Pegar</button>
              <button type="button" className="withdrawal-inspect" disabled={!file || !!preparing} onClick={event => { if (file) inspectReceipt(event, file, part.part_number, payments.length, Number(part.amount)); }}><Eye size={16} /> Inspeccionar</button>
              <button type="button" className="withdrawal-approve" disabled={busy || demo || !!preparing || !file} onClick={() => openPaymentSelection(request, part)}>{preparing === key ? 'Preparando…' : 'Confirmar pago'}</button>
            </div>}
          </div>;
        })}
      </section>}
      {isPending && payments.length === 0 && <p className="withdrawal-parts-missing">No se generaron los pagos de este retiro. Revisá la migración de retiros antes de acreditarlo.</p>}
      {isPending && <footer className="withdrawal-review-actions"><p>{paid.length ? 'El retiro seguirá en proceso hasta completar todos los pagos.' : 'Verificá los datos antes de transferir. Cada pago requiere su comprobante.'}</p>{paid.length === 0 && <div><button className="withdrawal-reject" type="button" disabled={busy || demo} onClick={() => { if (window.confirm('¿Confirmás que querés rechazar este retiro?')) onReview(request, 'rejected'); }}>Rechazar retiro</button></div>}</footer>}
    </article>;
  }

  function row(request: RequestRow) {
    const name = request.user_name || 'Usuario sin nombre';
    const payments = parts.filter(part => part.request_id === request.id);
    const paidCount = payments.filter(part => part.paid_at).length;
    const remaining = payments.length - paidCount;
    const status = request.status === 'pending' ? 'En proceso' : request.status === 'approved' ? 'Realizado' : 'Rechazado';
    return <button type="button" className="load-request-button withdrawal-summary-button" key={request.id} aria-haspopup="dialog" onClick={event => { trigger.current = event.currentTarget; setSelectedId(request.id); }}>
      <span className="request-avatar" aria-hidden="true">{name.charAt(0).toLocaleUpperCase('es')}</span>
      <span className="request-summary-user"><strong>{name}</strong><small>{date(request.created_at)}</small>{payments.length > 0 && <span className="withdrawal-summary-progress">{paidCount} de {payments.length} {payments.length === 1 ? 'retiro realizado' : 'retiros realizados'}</span>}{request.status === 'pending' && <span className="withdrawal-summary-help">{payments.length === 0 ? 'Pagos pendientes de generar' : remaining === 1 ? 'Falta 1 para completar el retiro' : `Faltan ${remaining} para completar el retiro`}</span>}</span>
      <span className="request-summary-amount"><strong>{money(request.amount)}</strong><span className={`badge ${request.status}`}>{status}</span></span>
      <ChevronRight className="request-chevron" aria-hidden="true" />
    </button>;
  }

  function section(items: RequestRow[], page: number, setPage: (page: number) => void, title: string, id: string, icon: ReactNode, empty: string) {
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const current = Math.min(page, pages - 1);
    return <section aria-labelledby={id}><h2 id={id}>{icon} {title} <span>{items.length}</span></h2>{items.length ? <>
      <div className="withdrawal-review-list">{items.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(row)}</div>
      {pages > 1 && <nav className="loads-pager" aria-label={`Páginas de retiros ${title.toLowerCase()}`}><button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</button><span>Página {current + 1} de {pages}</span><button type="button" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Siguiente</button></nav>}
    </> : <p className="card empty">{empty}</p>}</section>;
  }

  return <div className="admin-withdrawals">
    <div className="withdrawal-page-heading"><div><h1>Retiros</h1><p>Abrí un retiro para revisar los datos y completar sus pagos.</p></div><strong>{withdrawals.length} solicitudes</strong></div>
    {!selected && copyError && <p className="alert error" role="alert">{copyError}</p>}
    {!selected && receiptError && <p className="alert error" role="alert">{receiptError}</p>}
    <section className="withdrawal-source-section" aria-labelledby="withdrawal-source-title">
      <div className="withdrawal-source-heading"><div><h2 id="withdrawal-source-title">Cuentas para retiros</h2><p>Se puede confirmar un pago por cuenta cada 10 minutos. Solo aparecen las cuentas activas del turno.</p></div><strong>{sourceAccounts.filter(account => cooldownSeconds(account, serverTime) === 0).length} disponibles</strong></div>
      {sourceError && <p className="alert error" role="alert">{sourceError}</p>}
      {sourceLoading ? <p className="withdrawal-source-empty">Cargando cuentas del turno…</p> : sourceAccounts.length ? <div className="withdrawal-source-grid">{sourceAccounts.map(account => {
        const remaining = cooldownSeconds(account, serverTime);
        return <article className={`withdrawal-source-card${remaining ? ' is-cooling' : ''}`} key={account.id}><BankTransferCard bank={account} compact /><div className={`withdrawal-source-state${remaining ? ' is-cooling' : ''}`}><Clock3 size={15} /><span>{remaining ? `Disponible en ${cooldownLabel(remaining)}` : 'Disponible ahora'}</span></div></article>;
      })}</div> : <p className="withdrawal-source-empty">{sourceStatus?.mode === 'closing' ? 'Cierre de caja en curso. Las cuentas del próximo turno aparecerán al finalizar.' : sourceStatus?.mode === 'maintenance' ? 'Las cuentas están en mantenimiento.' : 'No hay cuentas activas en el turno actual.'}</p>}
    </section>
    {section(pending, pendingPage, setPendingPage, 'En proceso', 'withdrawals-pending-title', <Clock3 size={22} />, 'No hay retiros en proceso.')}
    {section(resolved, resolvedPage, setResolvedPage, 'Resueltos', 'withdrawals-resolved-title', <WalletCards size={22} />, 'Todavía no hay retiros resueltos.')}
    {selected && <div className="load-modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) closeDetail(); }}>
      <section className="withdrawal-modal" role="dialog" aria-modal="true" aria-label={`Detalle del retiro de ${selected.user_name || 'usuario'}`}>
        <button type="button" className="load-modal-close" aria-label="Cerrar detalle" autoFocus onClick={closeDetail}><X /></button>
        {copyError && <p className="alert error" role="alert">{copyError}</p>}
        {receiptError && <p className="alert error" role="alert">{receiptError}</p>}
        {card(selected)}
      </section>
    </div>}
    {paymentSelection && paymentRequest && paymentPart && <div className="load-modal-backdrop withdrawal-source-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget && !busy) setPaymentSelection(null); }}>
      <section className="withdrawal-source-modal" role="dialog" aria-modal="true" aria-label="Elegir cuenta de origen para el retiro">
        <header><div><strong>Elegí la cuenta de origen</strong><small>Retiro {paymentPart.part_number} · {money(Number(paymentPart.amount))} · {paymentRequest.user_name || 'Usuario'}</small></div><button type="button" aria-label="Cerrar selección de cuenta" autoFocus disabled={busy} onClick={() => setPaymentSelection(null)}><X size={20} /></button></header>
        <div className="withdrawal-source-modal-body">
          <p>Primero elegí el banco y después la cuenta desde la que hiciste la transferencia. El contador empieza cuando confirmás el pago.</p>
          {paymentError && <p className="alert error" role="alert">{paymentError}</p>}
          {sourceError && <p className="alert error" role="alert">{sourceError}</p>}
          <h3>1. Banco</h3>
          {banks.length ? <div className="withdrawal-bank-options">{banks.map(bank => {
            const bankAccounts = sourceAccounts.filter(account => account.bank === bank);
            const available = bankAccounts.filter(account => cooldownSeconds(account, serverTime) === 0).length;
            return <button type="button" key={bank} className={selectedBank === bank ? 'selected' : ''} aria-pressed={selectedBank === bank} onClick={() => { setSelectedBank(bank); setSelectedSourceId(''); setPaymentError(''); }}><strong>{bank}</strong><small>{available} de {bankAccounts.length} disponibles</small></button>;
          })}</div> : <p className="withdrawal-source-empty">No hay cuentas activas para retiros en este turno.</p>}
          {selectedBank && <><h3>2. Cuenta de {selectedBank}</h3><div className="withdrawal-source-grid is-selector">{sourceAccounts.filter(account => account.bank === selectedBank).map(account => {
            const remaining = cooldownSeconds(account, serverTime);
            return <article key={account.id} className={`withdrawal-source-card${remaining ? ' is-cooling' : ''}${selectedSourceId === account.id ? ' is-selected' : ''}`}><BankTransferCard bank={account} compact /><span className={`withdrawal-source-state${remaining ? ' is-cooling' : ''}`}><Clock3 size={15} />{remaining ? `Disponible en ${cooldownLabel(remaining)}` : selectedSourceId === account.id ? 'Cuenta seleccionada' : 'Disponible ahora'}</span><button type="button" className="withdrawal-source-select" aria-label={`Elegir ${account.bank}, ${account.alias}`} aria-pressed={selectedSourceId === account.id} disabled={!!remaining || busy} onClick={() => { setSelectedSourceId(account.id); setPaymentError(''); }} /></article>;
          })}</div></>}
        </div>
        <footer><span>{selectedSource ? `${selectedSource.bank} · ${selectedSource.alias}` : 'Seleccioná una cuenta disponible.'}</span><button type="button" className="withdrawal-approve" disabled={!selectedSource || (selectedSource ? cooldownSeconds(selectedSource, serverTime) > 0 : true) || busy || !paymentFile} onClick={() => void confirmPayment()}>{busy ? 'Confirmando…' : 'Confirmar pago con esta cuenta'}</button></footer>
      </section>
    </div>}
    {inspection && <div className="load-modal-backdrop withdrawal-inspection-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setInspection(null); }}>
      <section className="withdrawal-inspection" role="dialog" aria-modal="true" aria-label={`Vista previa del retiro ${inspection.number} de ${inspection.total}`}>
        <header><div><strong>Comprobante · Retiro {inspection.number} de {inspection.total}</strong><small>{money(inspection.amount)} · {inspection.name}</small></div><button type="button" aria-label="Cerrar vista previa" autoFocus onClick={() => setInspection(null)}><X size={20} /></button></header>
        <img src={inspection.url} alt={`Comprobante seleccionado para el retiro ${inspection.number} de ${inspection.total}`} />
        <p>Revisá la imagen. El pago se confirma desde la tarjeta del retiro.</p>
      </section>
    </div>}
  </div>;
}
