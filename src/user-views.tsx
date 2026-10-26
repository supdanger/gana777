import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Camera, ChevronRight, Eye, EyeOff, FileText, Images, Landmark, Link2, LockKeyhole, LogOut, MessageCircle, Send, ShieldCheck, Trash2, UserPlus, UserRound } from 'lucide-react';
import { PortalBanners, StorageImage, useContent } from './content';
import { HomeBonusCarousel } from './special-bonus-carousel';
import { asBonusRule, bonusEnabled, moneyInputMaxLength, moneyInputPattern, percentText, readMoney } from '../supabase/functions/_shared/bonus-rule';
import { creditAmounts } from './amounts';
import { date, money, supabase, type Bank, type BankOperationStatus, type RequestRow, type Message } from './lib';
import { ContactAnimation } from './contact-animation';
import { safeHttpsLink } from './security';
import { Turnstile } from './turnstile';
import { compressReceipt, readableFileSize } from './image-compression';
import { BankTransferCard } from './bank-transfer-card';
import { PlayerFooter } from './player-legal';
import { PortalInstall } from './portal-install';
import { homeBannerImage, homeBannerLayout, homeBannerLayoutStyles, homeBannerLink } from './home-banner';
import { portalBannersFor } from './portal-banners';
import { headerLogoLayout, headerLogoStyle } from './header-logo-layout';
import { themeBase, themeSurface } from './portal-theme-design';
import { referralShareMessage, referralShareUrl } from './share-referral';
import referralBannerUrl from './assets/home-casino-banner-v3.png';
import supportAvatarUrl from './assets/support-panda-avatar.png';
import { PlayerAccessRequest } from './player-access';
import { ChatImage, useChatImagePreview } from './chat-images';

export type Page = 'home' | 'profile' | 'deposit' | 'withdrawal' | 'referrals' | 'history' | 'users' | 'platform' | 'access-requests' | 'contacts' | 'portal' | 'themes' | 'bonuses' | 'accounts' | 'shifts' | 'chat' | 'cashiers' | 'announcements';
export const titles = { home: 'Inicio', profile: 'Mi perfil', deposit: 'Cargas', withdrawal: 'Retiros', referrals: 'Recomendados', history: 'Historial', users: 'Usuarios', platform: 'Platform', 'access-requests': 'Solicitudes', contacts: 'Contactos', portal: 'Portal', themes: 'Temas', bonuses: 'Bonos', accounts: 'Cuentas', shifts: 'Turnos', chat: 'Chat', cashiers: 'Cajeros', announcements: 'Mensajes' };
export function Brand({ panel = false, homeHeader = false }: { panel?: boolean; homeHeader?: boolean }) {
  const { settings } = useContent();
  const name = panel ? 'GANA777 Panel' : 'GANA777';
  const halloweenHeader = homeHeader && themeBase(settings) === 'halloween';
  const designLogo = settings.portal_theme_designs?.[settings.portal_theme]?.logoPath;
  const headerLogo = homeHeader ? designLogo ?? (halloweenHeader ? settings.portal_header_logo_halloween_path : settings.portal_header_logo_path) : null;
  return <span className={`brand${headerLogo ? ' has-portal-header-logo' : ''}${halloweenHeader ? ' halloween-brand' : ''}`}>{headerLogo ? <span className="portal-header-logo" style={headerLogoStyle(headerLogoLayout(settings, settings.portal_theme)) as CSSProperties}><StorageImage path={headerLogo} alt={name} className="portal-header-logo-image" /></span> : halloweenHeader ? <>Gana<span>777</span><small>bet.com</small></> : settings.logo_path ? <StorageImage path={settings.logo_path} alt={name} className="brand-image" /> : <>GANA<span>777</span></>}{panel && <span className="brand-role">Panel</span>}</span>;
}
export function SectionHeading({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
  return <div className="section-heading"><span className="icon-circle">{icon}</span><div><h2>{title}</h2>{description && <p>{description}</p>}</div></div>;
}
export function LoginView({ admin, busy, configured, feedback, onLogin, onDemo, onHelp, retryAt, siteKey }: {
  admin: boolean; busy: boolean; configured: boolean; feedback: ReactNode; retryAt: number; siteKey: string;
  onLogin: (event: FormEvent<HTMLFormElement>, captchaToken: string | null) => Promise<void>; onDemo: () => void; onHelp: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (retryAt <= Date.now()) return;
    const timer = window.setInterval(() => { const value = Date.now(); setNow(value); if (value >= retryAt) window.clearInterval(timer); }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await onLogin(event, captchaToken); }
    finally { setCaptchaToken(null); setCaptchaReset(value => value + 1); }
  }
  const { settings } = useContent();
  const surface = themeSurface(settings, path => supabase?.storage.from('app-assets').getPublicUrl(path).data.publicUrl ?? null);
  return <main className={`login ${admin ? 'admin-login' : `user-login ${surface.className}`}`} style={admin ? undefined : surface.style}>
    {admin && <Brand panel />}
    {admin ? <p className="eyebrow">PANEL DE ADMINISTRACIÓN</p> : <div className={`login-character ${settings.login_image_path === 'brand/panda-login-transparent.png' ? 'transparent-character' : settings.login_image_layout === 'reference' ? 'reference-character' : ''}`}><StorageImage path={settings.login_image_path} fallbackPath="brand/panda-login-transparent.png" alt="Panda GANA777 con gorra y campera azul" /></div>}
    {!admin && requestingAccess ? <PlayerAccessRequest onBack={() => setRequestingAccess(false)} /> : <><section className="card login-card">{!admin && <span className="brand login-domain-brand">gana777bet.com</span>}<h1>Bienvenido</h1>{admin && <p>Ingresá a tu cuenta</p>}
      <form onSubmit={submit}>
        {admin && <label htmlFor="email">Usuario o correo electrónico</label>}
        <div className="icon-input"><span className="input-icon"><UserRound /></span><input id="email" name="email" type="text" autoComplete="username" aria-label={admin ? undefined : 'Usuario'} placeholder={admin ? 'Ejemplo: carlos' : 'Usuario'} maxLength={254} autoCapitalize="none" spellCheck={false} required /></div>
        <label htmlFor="password">Contraseña</label>
        <div className="icon-input password"><span className="input-icon"><LockKeyhole /></span><input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder={admin ? 'Tu contraseña' : 'Contraseña'} maxLength={1024} required /><button type="button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff /> : <Eye />}</button></div>
        {siteKey && <Turnstile siteKey={siteKey} resetKey={captchaReset} onToken={setCaptchaToken} />}
        {feedback}{retrySeconds > 0 && <p className="login-retry" role="status">Podés volver a intentar en {retrySeconds} segundos.</p>}
        <button className="primary" disabled={busy || retrySeconds > 0 || (!!siteKey && !captchaToken)}>{busy ? 'Ingresando…' : retrySeconds > 0 ? 'Esperá para reintentar' : 'Ingresar'}</button>
      </form>
      {safeHttpsLink(settings.help_url) ? <a className="help-link" href={safeHttpsLink(settings.help_url)!} target="_blank" rel="noopener noreferrer">¿Necesitás ayuda?</a> : <button className="help-link" onClick={onHelp}>¿Necesitás ayuda?</button>}
    </section>{!admin && <button type="button" className="player-access-open" onClick={() => setRequestingAccess(true)}><span className="player-access-icon"><UserPlus size={22} aria-hidden="true" /></span><span className="player-access-copy"><strong>Crear usuario</strong><small>¿Primera vez? Solicitá tu acceso</small></span><ChevronRight className="player-access-arrow" size={20} aria-hidden="true" /></button>}</>}
    {!admin && <PortalInstall />}
    {(!configured || import.meta.env.DEV) && <button className="text-button" onClick={onDemo}>Explorar vista previa</button>}
    {admin ? <footer><span className="secure-connection"><ShieldCheck size={17} /> Conexión segura · GANA777 Panel</span></footer> : <PlayerFooter />}
  </main>;
}
export function UserHeader({ page, navigate, name = 'Mi perfil' }: { page: Page; navigate: (page: Page) => void; name?: string }) {
  return <header className={page === 'home' ? 'home-header' : 'inner-header'}>
    {page === 'home' ? <><Brand homeHeader /><button className="home-profile-button" onClick={() => navigate('profile')} aria-label={`Ver perfil e historial de ${name}`}><span className="user-avatar"><StorageImage path="avatars/panda-user-avatar.png" alt="" /></span><span className="home-profile-name">{name}</span><ChevronRight size={16} aria-hidden="true" /></button></> : <><button className="back-button" aria-label="Volver al inicio" onClick={() => navigate('home')}><ArrowLeft /></button><h1>{titles[page]}</h1><Brand /></>}
  </header>;
}
function WhatsAppMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.41a10 10 0 0 0 4.65 1.15h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2Zm5.78 14.12c-.24.68-1.4 1.3-1.94 1.38-.5.07-1.12.1-1.81-.11-.41-.13-.95-.31-1.64-.61-2.89-1.25-4.77-4.16-4.91-4.35-.14-.19-1.16-1.54-1.16-2.94s.73-2.08 1-2.37c.24-.27.64-.39.85-.39h.61c.19 0 .45-.03.7.53.27.6.91 2.08.99 2.23.08.15.13.33.03.53-.1.19-.15.31-.3.48-.15.17-.31.37-.44.5-.15.14-.3.29-.13.57.17.27.76 1.25 1.63 2.03 1.12 1 2.06 1.31 2.35 1.46.29.14.46.12.63-.07.17-.19.73-.85.92-1.14.19-.29.39-.24.65-.14.27.1 1.69.8 1.98.94.29.15.48.22.55.34.07.13.07.74-.17 1.42Z" /></svg>;
}
function TelegramMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.3 4.3 3.7 11c-1.2.48-1.18 1.15-.22 1.45l4.52 1.41 10.46-6.6c.49-.3.95-.14.57.19l-8.47 7.64-.32 4.58c.47 0 .68-.22.94-.48l2.26-2.2 4.7 3.47c.86.48 1.48.23 1.7-.8l3.07-14.5c.31-1.26-.48-1.83-1.31-1.46Z" /></svg>;
}
function InstagramMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 7.2A4.8 4.8 0 1 0 16.8 12 4.8 4.8 0 0 0 12 7.2Zm0 7.9A3.1 3.1 0 1 1 15.1 12 3.1 3.1 0 0 1 12 15.1Zm6.2-9.1a1.12 1.12 0 1 1-1.12-1.12A1.12 1.12 0 0 1 18.2 6Zm2.1 1.9a5.9 5.9 0 0 0-1.61-4.18A5.9 5.9 0 0 0 14.5 2.1c-1.63-.09-6.51-.09-8.14 0a5.9 5.9 0 0 0-4.18 1.62A5.9 5.9 0 0 0 .56 7.9c-.09 1.63-.09 6.51 0 8.14a5.9 5.9 0 0 0 1.62 4.18 5.9 5.9 0 0 0 4.18 1.62c1.63.09 6.51.09 8.14 0a5.9 5.9 0 0 0 4.18-1.62 5.9 5.9 0 0 0 1.62-4.18c.09-1.63.09-6.5 0-8.14Zm-2 9.95a3.36 3.36 0 0 1-1.9 1.9c-1.31.52-4.43.4-5.88.4s-4.58.12-5.89-.4a3.36 3.36 0 0 1-1.9-1.9c-.52-1.31-.4-4.43-.4-5.88s-.12-4.58.4-5.89a3.36 3.36 0 0 1 1.9-1.9c1.31-.52 4.43-.4 5.89-.4s4.57-.12 5.88.4a3.36 3.36 0 0 1 1.9 1.9c.52 1.31.4 4.43.4 5.89s.12 4.57-.4 5.88Z" /></svg>;
}
function CasinoChip() {
  return <span className="casino-chip" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" /><circle cx="16" cy="16" r="7" /><path d="M16 3v6M16 23v6M3 16h6M23 16h6M6.8 6.8l4.3 4.3M20.9 20.9l4.3 4.3M25.2 6.8l-4.3 4.3M11.1 20.9l-4.3 4.3" /></svg></span>;
}
const bonusBanners: Record<number, string> = {
  1000: '/preview-assets/bonus-1000.png',
  2000: '/preview-assets/bonus-2000.png',
};
function bonusBanner(promotion: { bonus_mode: string; bonus_amount: number; cooldown_hours?: number }) {
  return promotion.cooldown_hours ? '' : promotion.bonus_mode === 'fixed' ? bonusBanners[promotion.bonus_amount] ?? '' : '';
}
const greetingHourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hourCycle: 'h23',
});
function playerGreeting() {
  const hour = Number(greetingHourFormatter.format(new Date()));
  return hour >= 6 && hour < 12 ? 'Buenos días' : hour >= 12 && hour < 20 ? 'Buenas tardes' : 'Buenas noches';
}
export function UserHome({ name, navigate, onClaimSpecialBonus, whatsappUrl, username, casinoUrl }: { name: string; navigate: (page: Page) => void; onClaimSpecialBonus: (id: string) => void; whatsappUrl?: string | null; username?: string | null; casinoUrl?: string | null }) {
  const { settings, contactAnimations } = useContent();
  const bannerUrl = homeBannerLink(settings, casinoUrl);
  const bannerImage = homeBannerImage(settings, settings.portal_theme);
  const bannerStyle = homeBannerLayoutStyles(homeBannerLayout(settings, settings.portal_theme)) as CSSProperties;
  const shareUrl = referralShareUrl(username ?? null, whatsappUrl ?? null);
  const shareMessage = referralShareMessage(username ?? null, whatsappUrl ?? null);
  const [referralImage, setReferralImage] = useState<File | null>(null);
  const [greeting, setGreeting] = useState(playerGreeting);
  useEffect(() => {
    if (!shareUrl) return;
    const controller = new AbortController();
    void fetch(referralBannerUrl, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Imagen no disponible'); return response.blob(); })
      .then(blob => { if (!controller.signal.aborted) setReferralImage(new File([blob], 'gana777bet.png', { type: 'image/png' })); })
      .catch(() => { if (!controller.signal.aborted) setReferralImage(null); });
    return () => controller.abort();
  }, [shareUrl]);
  async function shareReferral(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!shareUrl || !shareMessage || !referralImage || !navigator.share || !navigator.canShare?.({ files: [referralImage] })) return;
    event.preventDefault();
    try {
      await navigator.share({ files: [referralImage], text: shareMessage });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      window.location.assign(shareUrl);
    }
  }
  useEffect(() => {
    const refreshGreeting = () => setGreeting(playerGreeting());
    const timer = window.setInterval(refreshGreeting, 60_000);
    window.addEventListener('focus', refreshGreeting);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshGreeting); };
  }, []);
  const contacts = [
    { name: 'WhatsApp', url: safeHttpsLink(whatsappUrl === undefined ? settings.whatsapp_url : whatsappUrl, ['wa.me', 'api.whatsapp.com']), mark: <WhatsAppMark />, className: 'whatsapp', animation: contactAnimations.whatsapp, visible: settings.show_whatsapp },
    { name: 'Recomendar', url: shareUrl, mark: <Send />, className: 'recommend', animation: null, visible: !!shareUrl && settings.show_whatsapp },
    { name: 'Telegram', url: safeHttpsLink(settings.telegram_url, ['t.me']), mark: <TelegramMark />, className: 'telegram', animation: contactAnimations.telegram, visible: settings.show_telegram },
    { name: 'Instagram', url: safeHttpsLink(settings.instagram_url, ['instagram.com', 'www.instagram.com']), mark: <InstagramMark />, className: 'instagram', animation: contactAnimations.instagram, visible: settings.show_instagram },
  ].filter(contact => contact.visible);
  return <>
    <h1 className="home-welcome">¡{greeting}, <span className="home-welcome-name">{name}!</span></h1>
    <HomeBonusCarousel onClaim={onClaimSpecialBonus} />
    <PortalBanners place="home" />
    <h2 className="section-title">¿Qué querés hacer?</h2>
    <div className="quick-actions">
      {bannerUrl && bannerImage && <a className="action-card home-link-banner" style={bannerStyle} href={bannerUrl} target="_blank" rel="noopener noreferrer" aria-label={`${settings.home_banner_title} (abre en otra pestaña)`}>{bannerImage.startsWith('/') ? <img src={bannerImage} alt={settings.home_banner_title} draggable={false} decoding="async" /> : <StorageImage path={bannerImage} alt={settings.home_banner_title} />}</a>}
      {([
        { id: 'deposit', title: 'Cargar', description: 'Hacé tu depósito y subí el comprobante', Icon: Landmark },
        { id: 'withdrawal', title: 'Retiros', description: 'Solicitá tu retiro', Icon: Link2 },
        { id: 'chat', title: 'Chat', description: 'Hablá con soporte', Icon: MessageCircle },
      ] as const).map(({ id, title, description, Icon }) => <button className="action-card" data-theme-card={id} key={id} onClick={() => navigate(id)}><span className="icon-circle"><Icon /></span><span><strong>{title}</strong><small>{description}</small></span><ChevronRight /></button>)}
    </div>
    {contacts.length > 0 && <section className="card contacts"><h2>Contactanos</h2><div className="contact-links">{contacts.map(({ name, url, mark, className, animation }) => {
      const icon = <span className="social-mark"><ContactAnimation path={animation} fallback={mark} /></span>;
      return url
        ? <a key={name} className={`social ${className}`} href={url} target="_blank" rel="noopener noreferrer" onClick={className === 'recommend' ? event => void shareReferral(event) : undefined} aria-label={className === 'recommend' ? 'Recomendar Gana777 con imagen por WhatsApp' : undefined} title={className === 'recommend' ? 'Elegí WhatsApp para enviar la imagen y el mensaje' : undefined}>{icon}<span className="social-name">{name}</span></a>
        : <span key={name} className={`social ${className} unavailable`} role="img" aria-label={`${name}, próximamente`} title={`${name}, próximamente`}>{icon}<span className="social-name" aria-hidden="true">{name}</span></span>;
    })}</div></section>}
    <PortalInstall />
  </>;
}
export function UserProfile({ name, busy, logout, allowLogout = false }: { name: string; busy: boolean; logout: () => void; allowLogout?: boolean }) {
  const { settings } = useContent();
  return <section className="card user-profile-summary">
    <span className="user-avatar"><StorageImage path="avatars/panda-user-avatar.png" alt="" /></span>
    <div><h1>{name}</h1></div>
    {(allowLogout || settings.allow_player_logout) && <button className="profile-logout" disabled={busy} onClick={logout}><LogOut size={18} /> Salir</button>}
  </section>;
}
function pauseCountdown(status: BankOperationStatus, now: number): string {
  const seconds = status.resumes_at ? Math.max(0, Math.ceil((Date.parse(status.resumes_at) - now) / 1000)) : 0;
  return [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}
function BankPause({ status, now }: { status: BankOperationStatus; now: number }) {
  const closing = status.mode === 'closing';
  return <section className={`cash-pause-banner ${closing ? 'closing' : 'maintenance'}`} aria-live="polite">
    <div className="cash-pause-copy">
      <span className="pause-brand">GANA<span>777</span></span>
      <h2>{closing ? <>Volvemos<br /><em>pronto</em></> : <>Estamos en<em>mantenimiento</em></>}</h2>
      <p>{closing ? 'Estamos preparando una cuenta para vos' : 'Estamos preparando todo para atenderte mejor'}</p>
      {closing && <div className="pause-countdown"><strong>{pauseCountdown(status, now)}</strong><small>Tiempo restante</small></div>}
      {!closing && <div className="pause-maintenance-note">Volvé a intentar más tarde</div>}
    </div>
  </section>;
}
export function RequestForm({ kind, requests, bank, bankOperation, retryAt = 0, initialSpecialBonusId = '', busy, demo, onSubmit, onCopy, onOpenWithdrawalHistory, feedback }: {
  kind: 'deposit' | 'withdrawal'; requests: RequestRow[]; bank: Bank | null; bankOperation: BankOperationStatus | null; retryAt?: number; initialSpecialBonusId?: string; busy: boolean; demo: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>, receipt?: File | null) => void; onCopy: (text: string, label: string) => void; onOpenWithdrawalHistory: () => void; feedback?: ReactNode;
}) {
  const { promotions, reloadPromotions, settings } = useContent();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (kind !== 'withdrawal' && bankOperation?.mode !== 'closing' && retryAt <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [kind, bankOperation?.mode, retryAt]);
  const pending = requests.some(r => r.kind === 'withdrawal' && r.status === 'pending');
  const pendingDeposit = kind === 'deposit' && requests.some(r => r.kind === 'deposit' && r.status === 'pending');
  const nextAt = Math.max(0, ...requests.filter(r => r.kind === 'withdrawal' && r.status === 'approved' && r.approved_at).map(r => Date.parse(r.approved_at!) + 86400000));
  const seconds = Math.max(0, Math.ceil((nextAt - now) / 1000));
  const countdown = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
  const withdrawalBlocked = kind === 'withdrawal' && (pending || seconds > 0);
  const depositRetrySeconds = kind === 'deposit' ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;
  const depositRetryCountdown = `${String(Math.floor(depositRetrySeconds / 60)).padStart(2, '0')}:${String(depositRetrySeconds % 60).padStart(2, '0')}`;
  const [file, setFile] = useState<File | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [preview, setPreview] = useState('');
  const [bonus, setBonus] = useState(initialSpecialBonusId);
  const [rawAmount, setRawAmount] = useState('');
  useEffect(() => { if (kind === 'withdrawal' && pending) setRawAmount(''); }, [kind, pending]);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const receiptChangeId = useRef(0);
  useEffect(() => { if (kind === 'deposit') reloadPromotions(); }, [kind, reloadPromotions]);
  const typedAmount = kind === 'deposit' ? readMoney(rawAmount) : null;
  const offers = promotions.filter(p => p.selectable && (p.cooldown_hours === 0 || p.id === initialSpecialBonusId) && (p.bonus_mode === 'fixed' ? p.bonus_amount > 0 : p.bonus_percent > 0));
  const initialSpecial = offers.find(p => p.id === initialSpecialBonusId);
  const available = typedAmount === null ? [] : offers.filter(p => bonusEnabled(asBonusRule(p), typedAmount));
  const bonusColumns = available.length === 0 ? ' single-option' : available.length === 1 ? ' two-options' : '';
  const selectedOffer = offers.find(offer => offer.id === bonus);
  const bonusCredit = selectedOffer && typedAmount !== null ? creditAmounts(typedAmount, selectedOffer.bonus_mode === 'percent' ? selectedOffer.bonus_percent : 0, selectedOffer.bonus_mode === 'fixed' ? selectedOffer.bonus_amount : 0).bonus : 0;
  const bonusCreditLabel = bonusCredit > 0 ? `+ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(bonusCredit)}` : '';
  useEffect(() => {
    if (!bonus) return;
    const amount = readMoney(rawAmount);
    if (!promotions.some(p => p.id === bonus)) return;
    if (amount !== null && !promotions.some(p => p.id === bonus && p.selectable && bonusEnabled(asBonusRule(p), amount))) setBonus('');
  }, [promotions, bonus, rawAmount]);
  useEffect(() => {
    if (!file?.type.startsWith('image/')) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (kind !== 'deposit' || !pendingDeposit) return;
    receiptChangeId.current += 1;
    [cameraInput, galleryInput, pdfInput].forEach(input => { if (input.current) input.current.value = ''; });
    setFile(null);
    setBonus('');
    setRawAmount('');
    setCompressing(false);
  }, [kind, pendingDeposit]);
  async function selectReceipt(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selected = input.files?.[0] ?? null;
    if (!selected) return;
    const changeId = ++receiptChangeId.current;
    setReceiptError('');
    setCompressing(true);
    try {
      const optimized = await compressReceipt(selected);
      if (changeId === receiptChangeId.current) {
        [cameraInput, galleryInput, pdfInput].forEach(other => { if (other.current && other.current !== input) other.current.value = ''; });
        setFile(optimized);
      }
    } catch (error) {
      if (changeId !== receiptChangeId.current) return;
      input.value = '';
      setReceiptError(error instanceof Error ? error.message : 'No pudimos preparar el comprobante.');
    } finally {
      if (changeId === receiptChangeId.current) setCompressing(false);
    }
  }
  function clearReceipt() {
    receiptChangeId.current += 1;
    [cameraInput, galleryInput, pdfInput].forEach(input => { if (input.current) input.current.value = ''; });
    setFile(null);
    setReceiptError('');
    setCompressing(false);
  }
  const withdrawalArt = portalBannersFor(settings.portal_banners, settings.portal_theme, 'withdrawal')[0];
  const withdrawalAmount = kind === 'withdrawal' ? readMoney(rawAmount) : null;
  const withdrawalPartCount = withdrawalAmount === null ? 0 : Math.ceil(withdrawalAmount / 100000);
  const amount = <label className="amount-label">Monto a {kind === 'deposit' ? 'cargar' : 'retirar'}<span className="amount-input">{(kind !== 'deposit' || rawAmount) && <span aria-hidden="true">$</span>}<input className="amount" name="amount" inputMode="decimal" type="text" pattern={moneyInputPattern} maxLength={moneyInputMaxLength} placeholder={kind === 'deposit' ? 'Carga mínima 3.000' : '10.000'} aria-label={`Monto a ${kind === 'deposit' ? 'cargar' : 'retirar'} en pesos argentinos`} required value={rawAmount} onChange={event => setRawAmount(event.target.value)} />{bonusCreditLabel && <span className="amount-bonus">{bonusCreditLabel}</span>}</span>{kind === 'withdrawal' && withdrawalPartCount > 1 && <small className="withdrawal-split-note">{withdrawalPartCount > 100 ? 'El máximo por solicitud es de $10.000.000.' : `Se pagará en ${withdrawalPartCount} transferencias de hasta ${money(100000)}. Cada pago tendrá su comprobante en el historial.`}</small>}</label>;
  return <form className="request-form" onSubmit={event => onSubmit(event, kind === 'deposit' ? file : null)}>
    {kind === 'deposit' ? <>
      <input type="hidden" name="bank_assignment_id" value={bank?.assignment_id ?? ''} />
      {!bank && bankOperation && bankOperation.mode !== 'online' ? <BankPause status={bankOperation} now={now} /> : bank ? <BankTransferCard bank={bank} onCopy={onCopy} /> : <section className="card bank-loading-card" aria-live="polite"><Landmark /><div><strong>Preparando una cuenta</strong><small>Esperá un momento…</small></div></section>}
      <section className="card deposit-amount">
        {initialSpecial && <p className="special-bonus-request-note">{bonus === initialSpecial.id ? 'Bono especial seleccionado' : 'Bono especial'}: +{money(initialSpecial.bonus_amount)} desde {money(initialSpecial.min_amount)}. La transferencia debe cumplir ese mínimo.</p>}
        {amount}
        {typedAmount !== null ? <fieldset className="bonus-options">
          <legend>Bonos disponibles</legend>
          <div className={`bonus-choices${bonusColumns}`}>
            <label className={`bonus-choice-art bonus-none-art${bonus === '' ? ' selected' : ''}`}><input type="radio" name="bonus_id" value="" checked={bonus === ''} onChange={() => setBonus('')} /><span className="bonus-none-frame"><img src="/preview-assets/bonus-none.png" alt="Sin bono" /></span></label>
            {available.map(p => {
              const reward = p.bonus_mode === 'fixed' ? `+${money(p.bonus_amount)}` : `+${percentText(p.bonus_percent)}%`;
              const banner = bonusBanner(p);
              return <label className={`${bonus === p.id ? 'selected' : ''}${banner ? ' bonus-choice-art bonus-reward-art' : ''}`} data-bonus-amount={p.bonus_amount} key={p.id}><input type="radio" name="bonus_id" value={p.id} checked={bonus === p.id} onChange={() => setBonus(p.id)} />{banner ? <span className="bonus-reward-frame"><img src={banner} alt={`Bono ${reward}`} /></span> : <><CasinoChip /><span className="bonus-choice-copy"><small>{p.title}</small><strong>{reward}</strong></span></>}<span className="bonus-selected-mark" aria-hidden="true" /></label>;
            })}
          </div>
          {offers.length > 0 && !available.length && <p className="bonus-range-note">Ningún bono está habilitado para este monto.</p>}
        </fieldset> : <input type="hidden" name="bonus_id" value="" />}
      </section>
      <section className="card receipt-card compact-receipt-card">
        <div className="receipt-compact-heading"><span><FileText /></span><strong>Comprobante</strong></div>
        <div className={`receipt-picker${file ? ' has-file' : ''}`}>
          {preview ? <img className="receipt-preview" src={preview} alt="Vista previa del comprobante seleccionado" /> : file ? <FileText className="camera-icon" size={30} /> : null}
          {(file || compressing) && <div className="receipt-file-copy" aria-live="polite"><strong>{compressing ? 'Optimizando imagen…' : file?.name}</strong><small>{compressing ? 'Esperá un momento' : file ? `Listo para enviar · ${readableFileSize(file.size)}` : ''}</small></div>}
          <div className="receipt-source-actions">
            <label className="receipt-source-button"><Camera size={20} /><span>Sacar foto</span><input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={event => void selectReceipt(event)} /></label>
            <label className="receipt-source-button"><Images size={20} /><span>Elegir de galería</span><input ref={galleryInput} type="file" accept="image/*" onChange={event => void selectReceipt(event)} /></label>
          </div>
          {file && <button className="receipt-remove" type="button" onClick={clearReceipt} aria-label="Eliminar comprobante"><Trash2 size={18} /></button>}
          <label className="receipt-pdf-option">¿Tenés el comprobante en PDF? Adjuntalo aquí<input ref={pdfInput} type="file" accept="application/pdf" onChange={event => void selectReceipt(event)} /></label>
          {receiptError && <small className="receipt-error" role="alert">{receiptError}</small>}
        </div>
      </section>
    </> : <>
      <section className={`card withdrawal-window${withdrawalArt ? ' has-withdrawal-art' : ''} ${pending ? 'pending' : seconds > 0 ? 'counting' : 'ready'}`} style={withdrawalArt ? homeBannerLayoutStyles(withdrawalArt.layout) as CSSProperties : undefined}>
        {withdrawalArt && (/\.(mp4|webm)$/i.test(withdrawalArt.path) ? <video className="withdrawal-banner-art" src={supabase?.storage.from('app-assets').getPublicUrl(withdrawalArt.path).data.publicUrl} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" /> : <StorageImage path={withdrawalArt.path} alt="" className="withdrawal-banner-art" />)}
        <div className="withdrawal-window-copy">
          {pending ? <><strong className="withdrawal-state-title">Retiro en proceso</strong><p>El contador comenzará cuando se acredite.</p></> : seconds > 0 ? <><p>Próximo retiro disponible en</p><strong className="withdrawal-countdown" role="timer" aria-label="Tiempo restante para solicitar otro retiro">{countdown}</strong></> : <><strong className="withdrawal-state-title">Retiro disponible</strong><p>Ya podés solicitarlo.</p></>}
        </div>
      </section>
      <button className="withdrawal-history-link" type="button" onClick={onOpenWithdrawalHistory}><FileText size={19} /><span>Ver historial de retiros</span><ChevronRight size={20} /></button>
      <section className="card account-card"><SectionHeading icon={<FileText />} title="Datos de la cuenta" /><label>Titular de la cuenta<input name="holder" autoComplete="name" placeholder="Nombre y apellido" minLength={2} maxLength={120} required /></label><label>Alias (opcional)<input name="alias" placeholder="Ej.: mi.alias" minLength={6} maxLength={20} pattern="[a-zA-Z0-9.\-]{6,20}" autoCapitalize="none" spellCheck={false} /></label><label>CBU / CVU<input name="cbu" placeholder="22 números, con o sin puntos" inputMode="decimal" pattern="[0-9. \-]{22,34}" maxLength={34} autoCapitalize="none" spellCheck={false} required /></label>{amount}</section>
    </>}
    {feedback && <div className="request-feedback">{feedback}</div>}
    {depositRetrySeconds > 0 && <div className="deposit-retry-countdown" role="timer" aria-live="polite"><span>Podés volver a enviar en</span><strong>{depositRetryCountdown}</strong></div>}
    <button className="primary" disabled={busy || demo || withdrawalBlocked || withdrawalPartCount > 100 || pendingDeposit || compressing || depositRetrySeconds > 0 || (kind === 'deposit' && (!file || !bank))} aria-describedby={pendingDeposit ? 'deposit-pending-message' : undefined}>{compressing ? 'Optimizando…' : busy ? kind === 'deposit' ? 'Enviando solicitud…' : 'Enviando…' : depositRetrySeconds > 0 ? `Esperá ${depositRetryCountdown}` : kind === 'deposit' ? 'Solicitar carga' : 'Solicitar retiro'}</button>
    {pendingDeposit && <p id="deposit-pending-message" className="deposit-pending-message" role="status">Tu carga ya está en proceso. Podrás solicitar otra cuando sea aprobada o rechazada.</p>}
  </form>;
}
export function Conversation({ messages, userId, busy, disabled, onSubmit }: { messages: Message[]; userId: string; busy: boolean; disabled: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const log = useRef<HTMLElement>(null);
  const nearBottom = useRef(true);
  const [image, setImage] = useState<File | null>(null);
  const imagePreview = useChatImagePreview(image);
  const imageInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (log.current && nearBottom.current) log.current.scrollTop = log.current.scrollHeight; }, [messages]);
  return <>
    <section className="card support"><div className="support-profile"><img className="support-avatar" src={supportAvatarUrl} alt="Panda de soporte GANA777" /><div><h2>Soporte</h2><p className="support-domain">gana777bet.com</p></div></div></section>
    <section ref={log} className="card chat-log" role="log" aria-label="Conversación con soporte" aria-live="polite" onScroll={e => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      <div className="chat-date"><span>Tu conversación</span></div>
      {!messages.length && <p className="chat-welcome">¡Hola! Bienvenido a GANA777.<br />¿En qué podemos ayudarte?</p>}
      {messages.map(m => <div className={`message ${m.sender_id === userId ? 'mine' : ''}`} key={m.id}><p>{m.body === 'Imagen adjunta' && m.attachment_path ? '' : m.body}{m.attachment_path && <ChatImage path={m.attachment_path} />}</p><small>{date(m.created_at)}</small></div>)}
    </section>
    <form className="composer chat-composer" onSubmit={onSubmit} onReset={() => setImage(null)}>{imagePreview && <div className="chat-image-preview"><img src={imagePreview} alt="Imagen seleccionada" /><span>{image?.name}</span><button type="button" aria-label="Quitar imagen" onClick={() => { setImage(null); if (imageInput.current) imageInput.current.value = ''; }}><Trash2 size={16} /></button></div>}<input ref={imageInput} className="chat-file-input" name="image" type="file" accept="image/*" disabled={busy || disabled} onChange={event => setImage(event.target.files?.[0] ?? null)} /><button type="button" className="chat-gallery-button" aria-label="Adjuntar imagen de la galería" disabled={busy || disabled} onClick={() => imageInput.current?.click()}><Images size={22} /></button><input name="message" aria-label="Mensaje" placeholder="Escribí un mensaje…" maxLength={2000} autoComplete="off" enterKeyHint="send" required={!image} /><button className="send" aria-label="Enviar mensaje" disabled={busy || disabled}><Send size={24} /></button></form>
  </>;
}
