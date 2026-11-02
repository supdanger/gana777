import type { ReactNode } from 'react';
import { ChevronRight, UserRound } from 'lucide-react';
import modernPanda from './assets/panda-login-transparent.png';

export function ModernBrand() {
  return <span className="brand modern-brand">Gana777bet.com</span>;
}

export function ModernAccountButton({ onClick }: { onClick?: () => void }) {
  return <button className="home-profile-button modern-account" type="button" onClick={onClick} aria-label="Mi perfil"><UserRound size={18} strokeWidth={2} aria-hidden="true" /><span className="home-profile-name">Mi perfil</span></button>;
}

function WalletPlusIcon() {
  return <svg viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m21 33 58-21a9 9 0 0 1 12 6l5 17M62 100H23a11 11 0 0 1-11-11V46a11 11 0 0 1 11-11h73a11 11 0 0 1 11 11v8" />
    <circle cx="92" cy="89" r="27" /><path d="M92 77v24M80 89h24" />
  </svg>;
}
function CardsIcon() {
  return <svg viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m81 25 29 6a10 10 0 0 1 8 12l-15 66a10 10 0 0 1-12 8l-40-10" />
    <g transform="rotate(-15 52 61)">
      <rect x="18" y="15" width="68" height="92" rx="9" />
      <path d="M52 39c-4 8-18 17-18 27 0 7 10 12 17 4-1 7-5 12-9 16h20c-4-4-8-9-9-16 7 8 17 3 17-4 0-10-14-19-18-27Z" fill="currentColor" stroke="none" />
    </g>
  </svg>;
}
function BankIcon() {
  return <svg viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 43 54 13a4 4 0 0 1 4 0l44 30a2 2 0 0 1-1 4H11a2 2 0 0 1-1-4Z" />
    <path d="M21 57v30M43 57v30M65 57v14M87 57v6M10 97h53" />
    <circle cx="91" cy="89" r="27" />
    <path d="M79 89h23M92 79l10 10-10 10" />
  </svg>;
}
function GiftIcon() {
  return <svg viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M64 40C64 22 54 10 43 10c-11 0-20 9-20 19 0 9 8 15 19 15h22M64 40c0-18 10-30 21-30 11 0 20 9 20 19 0 9-8 15-19 15H64" />
    <rect x="14" y="44" width="100" height="24" rx="7" />
    <path d="M21 68v39a9 9 0 0 0 9 9h68a9 9 0 0 0 9-9V68M64 44v72" />
  </svg>;
}
function HeadsetIcon() {
  return <svg viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 43a43 43 0 0 1 84 0M24 42H17A10 10 0 0 0 7 52v16a10 10 0 0 0 10 10h13M104 42h7a10 10 0 0 1 10 10v16a10 10 0 0 1-10 10H98" />
    <path d="M24 42v34l11 10-6 24 23-13a43 43 0 0 0 52-42V42" />
    <g fill="currentColor" stroke="none"><circle cx="44" cy="57" r="6" /><circle cx="64" cy="57" r="6" /><circle cx="84" cy="57" r="6" /></g>
  </svg>;
}

function ModernCard({ id, title, description, icon, href, onClick }: { id: string; title: string; description: string; icon: ReactNode; href?: string | null; onClick?: () => void }) {
  const body = <><span className="icon-circle">{icon}</span><span><strong>{title}</strong><small>{description}</small></span><ChevronRight aria-hidden="true" /></>;
  if (href) return <a className="action-card" data-theme-card={id} href={href} target="_blank" rel="noopener noreferrer">{body}</a>;
  return <button className="action-card" data-theme-card={id} type="button" onClick={onClick}>{body}</button>;
}

export function ModernHomeBody({ name, gamesUrl = null, onDeposit, onWithdraw, onBonuses, onChat }: {
  name: string;
  gamesUrl?: string | null;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onBonuses?: () => void;
  onChat?: () => void;
}) {
  return <>
    <div className="modern-hero">
      <h1 className="home-welcome">Hola, <span className="home-welcome-name">{name}</span></h1>
      <img className="modern-home-mascot" src={modernPanda} alt="" aria-hidden="true" draggable={false} />
      <h2 className="section-title">¿Qué querés hacer?</h2>
    </div>
    <div className="quick-actions">
      <ModernCard id="games" title="Ir a los juegos" description="Entrá al casino y elegí un juego" icon={<CardsIcon />} href={gamesUrl} />
      <ModernCard id="deposit" title="Cargar saldo" description="Agregá dinero para jugar" icon={<WalletPlusIcon />} onClick={onDeposit} />
      <ModernCard id="withdrawal" title="Retirar dinero" description="Pedí un retiro a tu cuenta" icon={<BankIcon />} onClick={onWithdraw} />
      <ModernCard id="bonuses" title="Bonos disponibles" description="Consultá los bonos para tu carga" icon={<GiftIcon />} onClick={onBonuses} />
      <ModernCard id="chat" title="Chat de soporte" description="Escribinos si necesitás ayuda" icon={<HeadsetIcon />} onClick={onChat} />
    </div>
    <p className="modern-home-legal">Gana777bet.com · Solo mayores de 18 años</p>
  </>;
}
