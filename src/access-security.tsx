import { AccountSecurity } from './account-security';
import { useEffect, useRef, useState } from 'react';
import { invokeAdminPlayerAccess } from './admin-player-access-api';
import { date } from './lib';
import './access-security.css';

type Operation = 'pause' | 'browser' | 'ip' | 'review' | 'exception' | 'unblock_browser' | 'unblock_ip';
type Security = {
  can_ip: boolean; can_browser: boolean; browser_info: string; observed_at: string; recent_requests: number;
  controls: { scope: string; expires_at: string | null }[];
  related: { username: string; same_ip: boolean; same_browser: boolean; similar_footprint: boolean; observed_at: string }[];
  events: { id: number; action: string; reason: string; created_at: string; expires_at: string | null; actor: string }[];
};
const labels: Record<Operation, string> = { pause: 'Pausar nuevas solicitudes', browser: 'Bloquear navegador', ip: 'Bloquear toda la IP', review: 'Marcar como revisado', exception: 'Autorizar red compartida', unblock_browser: 'Retirar control del navegador', unblock_ip: 'Desbloquear IP' };

export function AccessSecurity({ requestId, username, onClose, onChanged, hasAccount }: { hasAccount: boolean; requestId: string; username: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [data, setData] = useState<Security | null>(null);
  const [operation, setOperation] = useState<Operation | ''>('');
  const [preset, setPreset] = useState('15');
  const [quantity, setQuantity] = useState('30');
  const [unit, setUnit] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let alive = true;
    void invokeAdminPlayerAccess({ action: 'admin-security', request_id: requestId }).then(result => { if (alive) setData(result.security as Security); }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'No pudimos cargar la ficha.'); });
    return () => { alive = false; document.body.style.overflow = previous; };
  }, [requestId]);
  async function apply() {
    if (!operation || lock.current) return;
    if (reason.trim().length < 5) { setError('Escribí un motivo de al menos 5 caracteres.'); return; }
    const minutes = preset === 'custom' ? Number(quantity) * Number(unit) : Number(preset);
    if (operation === 'pause' && (!Number.isInteger(minutes) || minutes < 1 || minutes > 43200)) { setError('Elegí entre 1 minuto y 30 días.'); return; }
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await invokeAdminPlayerAccess({ action: 'admin-security-apply', request_id: requestId, operation, reason: reason.trim(), minutes: operation === 'pause' ? minutes : null });
      setData(result.security as Security); setOperation(''); setReason(''); setNotice('Acción guardada en el historial.');
      try { await onChanged(); } catch { setNotice('Acción guardada. Actualizá la lista para reflejar el cambio.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos guardar la acción.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function choose(value: Operation) { setOperation(value); setReason(''); setError(''); setNotice(''); }
  return <dialog ref={dialog} className="access-security-dialog" aria-labelledby="access-security-title" onCancel={event => { if (lock.current) event.preventDefault(); }} onClose={onClose}>
    <header><div><small>CONTROL MANUAL · SOLICITUDES</small><h2 id="access-security-title">Seguridad de @{username}</h2></div><button type="button" disabled={busy} aria-label="Cerrar ficha de seguridad" onClick={() => dialog.current?.close()}>Cerrar</button></header>
    <p className="access-security-intro">Las coincidencias técnicas no confirman que sea la misma persona. Los controles se aplican únicamente cuando los confirmás.</p>
    {error && <p role="alert" className="access-security-error">{error}</p>}{notice && <p role="status" className="access-security-notice">{notice}</p>}
    {!data && !error && <p role="status">Cargando ficha de seguridad…</p>}
    {data && <div className="access-security-grid"><div>
      <section><h3>Señales y actividad registrada</h3><p>{data.browser_info}</p><p className="access-security-muted">Solicitud registrada: {date(data.observed_at)}</p><p><strong>{data.recent_requests}</strong> solicitudes desde este navegador en las últimas 24 horas.</p><small>El identificador del navegador puede cambiar al borrar datos. Una huella técnica es una coincidencia aproximada.</small></section>
      <section><h3>Cuentas relacionadas <small>Hasta 20 solicitudes recientes</small></h3>{data.related.length ? data.related.map((r, i) => <article key={`${r.username}-${i}`}><strong>@{r.username}</strong><div className="access-security-tags">{r.same_ip && <span>IP compartida</span>}{r.same_browser && <span>Mismo navegador registrado</span>}{r.similar_footprint && <span>Huella técnica similar</span>}</div><small>Solicitud registrada: {date(r.observed_at)}</small></article>) : <p className="access-security-muted">No se encontraron solicitudes relacionadas.</p>}</section>
      <section><h3>Historial de seguridad <small>Últimos 30 eventos</small></h3>{data.events.length ? data.events.map(e => <article key={e.id}><strong>{labels[e.action as Operation] ?? e.action}</strong><p>{e.reason}</p><small>{date(e.created_at)} · {e.actor}</small>{e.expires_at && <div><small>Vencimiento registrado: {date(e.expires_at)}</small></div>}</article>) : <p className="access-security-muted">Todavía no hay acciones registradas.</p>}</section>
    </div><aside>{hasAccount && <AccountSecurity requestId={requestId} />}<section><h3>Controles actuales</h3>{data.controls.length ? data.controls.map(c => <article key={c.scope}><strong>{c.scope === 'ip' ? 'IP bloqueada' : c.expires_at ? 'Navegador en pausa' : 'Navegador bloqueado'}</strong><p>{c.expires_at ? `Hasta ${date(c.expires_at)}` : 'Hasta que retires el bloqueo'}</p><button type="button" disabled={busy} onClick={() => choose(c.scope === 'ip' ? 'unblock_ip' : 'unblock_browser')}>Retirar este control</button></article>) : <p className="access-security-muted">Sin pausas ni bloqueos activos.</p>}</section>
      <section><h3>Aplicar una acción</h3><div className="access-security-actions">{(['pause','browser','ip','review','exception'] as Operation[]).map(op => <button type="button" key={op} className={op === 'ip' ? 'access-security-danger' : ''} disabled={busy || (['pause','browser'].includes(op) && !data.can_browser) || (['ip','exception'].includes(op) && !data.can_ip)} onClick={() => choose(op)}>{labels[op]}</button>)}</div><p className="access-security-muted">Bloquear la IP afecta también a familiares que compartan la red. Las solicitudes y conversaciones existentes siguen disponibles.</p></section>
      {operation && <section className="access-security-confirm"><h3>{labels[operation]}</h3><p>{operation === 'ip' ? 'Impedirá nuevas solicitudes de todas las personas que usen esta IP.' : operation === 'exception' ? 'Registrará la revisión de esta red compartida. No retira bloqueos existentes.' : operation === 'review' ? 'Registrará tu revisión sin agregar ni retirar bloqueos.' : operation.startsWith('unblock') ? 'Retirará este control para todas las solicitudes con la misma referencia.' : 'Impedirá nuevas solicitudes desde el navegador registrado. No bloquea el inicio de sesión de cuentas existentes.'}</p>
        {operation === 'pause' && <><label htmlFor="security-duration">Duración</label><select id="security-duration" disabled={busy} value={preset} onChange={e => setPreset(e.target.value)}><option value="15">15 minutos</option><option value="120">2 horas</option><option value="360">6 horas</option><option value="720">12 horas</option><option value="custom">Personalizada</option></select>{preset === 'custom' && <div className="access-security-custom"><input aria-label="Cantidad de tiempo" type="number" min="1" value={quantity} disabled={busy} onChange={e => setQuantity(e.target.value)} /><select aria-label="Unidad de tiempo" value={unit} disabled={busy} onChange={e => setUnit(e.target.value)}><option value="1">Minutos</option><option value="60">Horas</option><option value="1440">Días</option></select></div>}</>}
        <label htmlFor="security-reason">Motivo obligatorio</label><textarea id="security-reason" value={reason} maxLength={240} disabled={busy} onChange={e => setReason(e.target.value)} /><div className="access-security-actions"><button type="button" className="access-security-save" disabled={busy} onClick={() => void apply()}>{busy ? 'Guardando…' : 'Confirmar acción'}</button><button type="button" disabled={busy} onClick={() => { setOperation(''); setError(''); }}>Cancelar</button></div>
      </section>}
    </aside></div>}
  </dialog>;
}
