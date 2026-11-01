import type { ReactNode } from 'react';
import { ChevronRight, Crown, UserRound } from 'lucide-react';

export function ModernBrand() {
  return <span className="brand modern-brand"><Crown className="modern-brand-crown" strokeWidth={2.2} aria-hidden="true" />Gana777bet.com</span>;
}

export function ModernAccountButton({ onClick }: { onClick?: () => void }) {
  return <button className="home-profile-button modern-account" type="button" onClick={onClick} aria-label="Mi cuenta"><UserRound size={18} strokeWidth={2} aria-hidden="true" /><span className="home-profile-name">Mi cuenta</span></button>;
}

function WalletPlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.4" y="6" width="14.2" height="11.2" rx="2" /><path d="M2.4 10.1h14.2" /><circle cx="17.6" cy="16.4" r="3.5" /><path d="M17.6 14.6v3.6M15.8 16.4h3.6" /></svg>;
}
function CardsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="3.2" width="11" height="14.2" rx="1.6" transform="rotate(14 13.5 10.3)" /><rect x="3.4" y="6.2" width="11.2" height="14.2" rx="1.6" fill="none" /><path d="M8.2 11.2c.9-1.7 1.6-1.7 2.5 0-.5.7-1.25 1.15-1.25 1.7 0-.55-.75-1-1.25-1.7Z" fill="currentColor" stroke="none" /></svg>;
}
function BankIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.2 9.2 11 4.4l7.8 4.8" /><path d="M4.4 9.4v6.2M7.6 9.4v6.2M10.8 9.4v6.2M14 9.4v6.2" /><path d="M3 15.8h12.2" /><circle cx="17.7" cy="16.5" r="3.3" /><path d="M16.4 16.5h2.5M17.7 15.1l1.3 1.4-1.3 1.4" /></svg>;
}
function GiftIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="9.2" rx="1.4" /><path d="M4 14.2h16M12 10v9.2" /><path d="M12 10c0-2.2-1.5-3.6-3.1-3.6-1.4 0-2.3 1-2.3 2 0 1.5 2.1 1.6 5.4 1.6s5.4-.1 5.4-1.6c0-1-.9-2-2.3-2-1.6 0-3.1 1.4-3.1 3.6Z" /></svg>;
}
function HeadsetIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5a7 7 0 0 1 14 0" /><rect x="3.4" y="12.2" width="3.6" height="6.2" rx="1.4" /><rect x="17" y="12.2" width="3.6" height="6.2" rx="1.4" /><path d="M17.2 18.2c0 1.6-1.6 2.8-4 2.8h-1.4" /></svg>;
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
      <h2 className="section-title">¿Qué querés hacer?</h2>
    </div>
    <div className="quick-actions">
      <ModernCard id="deposit" title="Cargar saldo" description="Agregá dinero para jugar" icon={<WalletPlusIcon />} onClick={onDeposit} />
      <ModernCard id="games" title="Ir a los juegos" description="Entrá al casino y elegí un juego" icon={<CardsIcon />} href={gamesUrl} />
      <ModernCard id="withdrawal" title="Retirar dinero" description="Pedí un retiro a tu cuenta" icon={<BankIcon />} onClick={onWithdraw} />
      <ModernCard id="bonuses" title="Bonos disponibles" description="Consultá los bonos para tu carga" icon={<GiftIcon />} onClick={onBonuses} />
      <ModernCard id="chat" title="Chat de soporte" description="Escribinos si necesitás ayuda" icon={<HeadsetIcon />} onClick={onChat} />
    </div>
    <p className="modern-home-legal">Gana777bet.com · Solo mayores de 18 años</p>
  </>;
}
