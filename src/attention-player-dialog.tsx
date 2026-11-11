import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { AttentionPlayerContext } from './attention-player-context';

export function AttentionPlayerDialog({ onClose, ...props }: {
  userId: string; username: string; demo: boolean; canDeposit: boolean; canWithdrawal: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="attention-player-dialog" aria-label="Datos del jugador" onCancel={event => { event.preventDefault(); onClose(); }}>
    <button type="button" className="attention-dialog-close" onClick={onClose} aria-label="Cerrar datos del jugador"><X size={18} /></button>
    <AttentionPlayerContext {...props} />
  </dialog>;
}
