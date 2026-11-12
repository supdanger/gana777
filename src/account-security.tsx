import { useEffect, useRef, useState } from 'react';
import { invokeAdminPlayerAccess } from './admin-player-access-api';
import { date } from './lib';
import './access-security.css';
type AccountState = { blocked: boolean; updated_at: string; reason: string } | null;
type Event = { id: number; blocked: boolean; reason: string; actor_id: string; created_at: string };
export function AccountSecurity({ requestId, userId }: { requestId?: string; userId?: string }) {
  const [control, setControl] = useState<AccountState>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [choice, setChoice] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');
  const lock = useRef(false);
  const target = requestId ? { request_id: requestId } : { user_id: userId };
  useEffect(() => {
    let alive = true;
    void invokeAdminPlayerAccess({ action: 'admin-account-security', ...target }).then(result => { if (alive) { setControl(result.control as AccountState); setEvents(result.events as Event[]); } }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'No pudimos consultar la cuenta.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [requestId, userId]);
  async function save() {
    if (lock.current || choice === null) return;
    if (reason.trim().length < 5) { setError('Escribí un motivo de al menos 5 caracteres.'); return; }
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await invokeAdminPlayerAccess({ action: 'admin-account-apply', ...target, blocked: choice, reason: reason.trim() });
      setControl(result.control as AccountState); setEvents(result.events as Event[]); setNotice(result.warning || (choice ? 'Usuario bloqueado. Sus sesiones anteriores fueron revocadas.' : 'Usuario desbloqueado. Deberá iniciar una sesión nueva.')); setChoice(null); setReason('');
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos actualizar el usuario.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section><h3>Bloqueo del usuario</h3>{loading ? <p role="status">Consultando cuenta…</p> : <>
    <p><strong>{control?.blocked ? 'Usuario bloqueado' : 'Sin bloqueo de cuenta'}</strong></p><p className="access-security-muted">Bloquea el acceso de esta cuenta al portal en todos sus dispositivos. Las sesiones abiertas se cierran al recibir el aviso o en la siguiente comprobación. El servidor corta el acceso protegido al aplicar el bloqueo.</p>
    {control && <p><small>{control.reason} · {date(control.updated_at)}</small></p>}
    <div className="access-security-actions"><button type="button" className="access-security-danger" disabled={busy || !!error && !control && !events.length} onClick={() => { setChoice(true); setReason(''); setError(''); }}>Bloquear usuario y cerrar sesiones</button>{control?.blocked && <button type="button" disabled={busy} onClick={() => { setChoice(false); setReason(''); setError(''); }}>Desbloquear usuario</button>}</div>
    {choice !== null && <div className="access-security-confirm"><strong>{choice ? 'Confirmar bloqueo de cuenta' : 'Confirmar desbloqueo'}</strong><p>{choice ? 'Se cerrarán sus sesiones y no podrá operar con esta cuenta en el portal.' : 'Podrá ingresar nuevamente con sus credenciales. Sus sesiones anteriores seguirán revocadas.'}</p><label>Motivo obligatorio<textarea maxLength={240} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></label><div className="access-security-actions"><button type="button" className="access-security-save" disabled={busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Confirmar cambio de cuenta'}</button><button type="button" disabled={busy} onClick={() => setChoice(null)}>Cancelar cambio de cuenta</button></div></div>}
    <h3>Historial de cuenta</h3>{events.map(e => <article key={e.id}><strong>{e.blocked ? 'Usuario bloqueado' : 'Usuario desbloqueado'}</strong><p>{e.reason}</p><small>{date(e.created_at)} · Operador {e.actor_id}</small></article>)}{!events.length && <small>Sin cambios de bloqueo registrados.</small>}
  </>}{error && <p role="alert" className="access-security-error">{error}</p>}{notice && <p role="status" className="access-security-notice">{notice}</p>}</section>;
}

export function AccountSecurityDialog({ userId, username, onClose }: { userId: string; username: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="access-security-dialog" aria-label={`Seguridad de ${username}`} onClose={onClose}><header><h2>Seguridad de @{username}</h2><button type="button" onClick={() => dialog.current?.close()}>Cerrar</button></header><AccountSecurity userId={userId} /></dialog>;
}
