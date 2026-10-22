import { ShieldCheck } from 'lucide-react';

export function PlayerFooter() {
  return <footer className="player-footer">
    <span className="secure-connection"><ShieldCheck size={16} /> Conexión segura · GANA777</span>
    <small className="adult-only-notice">Solo para mayores de 18 años (+18)</small>
  </footer>;
}
