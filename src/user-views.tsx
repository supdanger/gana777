import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Camera, ChevronRight, Disc, Eye, EyeOff, FileText, Gift, Images, Landmark, Link2, LockKeyhole, LogOut, MessageCircle, Send, ShieldCheck, Trash2, UserPlus, UserRound, X } from 'lucide-react';
import { StorageImage, useContent } from './content';
import { HomeBonusCarousel } from './special-bonus-carousel';
import { asBonusRule, bonusEnabled, moneyInputMaxLength, moneyInputPattern, percentText, readMoney } from '../supabase/functions/_shared/bonus-rule';
import { creditAmounts } from './amounts';
import { date, money, supabase, type Bank, type BankOperationStatus, type RequestRow, type Message } from './lib';
import { wheelWaitLabel } from './wheel-sequence';
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
import { isImageCardSlot, themeBase, themeSurface } from './portal-theme-design';
import { referralShareMessage, referralShareUrl } from './share-referral';
import referralBannerUrl from './assets/home-casino-banner-v3.png';
import { PlayerAccessRequest } from './player-access';
import { ChatImage, useChatImagePreview } from './chat-images';

export type Page = 'home' | 'profile' | 'deposit' | 'withdrawal' | 'referrals' | 'wheel' | 'history' | 'users' | 'platform' | 'access-requests' | 'contacts' | 'portal' | 'themes' | 'bonuses' | 'accounts' | 'shifts' | 'chat' | 'external-chat' | 'external-chat-admin' | 'cashiers' | 'announcements' | 'telegram';
export const titles = { home: 'Inicio', profile: 'Mi perfil', deposit: 'Cargas', withdrawal: 'Retiros', referrals: 'Recomendados', wheel: 'Ruleta', history: 'Historial', users: 'Usuarios', platform: 'Platform', 'access-requests': 'Solicitudes', contacts: 'Contactos', portal: 'Portal', themes: 'Temas', bonuses: 'Bonos', accounts: 'Cuentas', shifts: 'Turnos', chat: 'Chat', 'external-chat': 'Chat externo', 'external-chat-admin': 'Admin', cashiers: 'Cajeros', announcements: 'Mensajes', telegram: 'Telegram' };
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
export function LoginView({ admin, busy, configured, feedback, onLogin, onDemo, retryAt, siteKey }: {
  admin: boolean; busy: boolean; configured: boolean; feedback: ReactNode; retryAt: number; siteKey: string;
  onLogin: (event: FormEvent<HTMLFormElement>, captchaToken: string | null) => Promise<void>; onDemo: () => void;
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
    {admin ? <p className="eyebrow">PANEL DE ADMINISTRACIÓN</p> : <div className={`login-character ${settings.login_image_path === 'brand/panda-login-transparent.png' || settings.login_image_path === 'brand/panda-login-bright.png' ? 'transparent-character' : settings.login_image_layout === 'reference' ? 'reference-character' : ''}`}><StorageImage path={settings.login_image_path} fallbackPath="brand/panda-login-transparent.png" alt="Panda GANA777 con gorra y campera morada" /></div>}
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
const greetingHourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hourCycle: 'h23',
});
function playerGreeting() {
  const hour = Number(greetingHourFormatter.format(new Date()));
  return hour >= 6 && hour < 12 ? 'Buenos días' : hour >= 12 && hour < 20 ? 'Buenas tardes' : 'Buenas noches';
}
export function UserHome({ name, navigate, onClaimSpecialBonus, whatsappUrl, username, casinoUrl, demo = false, userId = '', wheelEligible = false }: { name: string; navigate: (page: Page) => void; onClaimSpecialBonus: (id: string) => void; whatsappUrl?: string | null; username?: string | null; casinoUrl?: string | null; demo?: boolean; userId?: string; wheelEligible?: boolean }) {
  const { settings, contactAnimations } = useContent();
  const bannerUrl = homeBannerLink(settings, casinoUrl);
  const bannerImage = homeBannerImage(settings, settings.portal_theme);
  const casinoBannerLayout = homeBannerLayout(settings, settings.portal_theme);
  const bannerStyle = homeBannerLayoutStyles({ ...casinoBannerLayout, height: casinoBannerLayout.height * 2 }) as CSSProperties;
  const shareUrl = referralShareUrl(username ?? null, whatsappUrl ?? null);
  const shareMessage = referralShareMessage(username ?? null, whatsappUrl ?? null);
  const [referralImage, setReferralImage] = useState<File | null>(null);
  const [greeting, setGreeting] = useState(playerGreeting);
  const [nextSpinAt, setNextSpinAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const wheelWait = wheelWaitLabel(nextSpinAt, now);
  const wheelWaitClock = wheelWait?.replace(/^Otro giro en\s+/, '');
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
  useEffect(() => {
    if (!nextSpinAt || Date.parse(nextSpinAt) <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (Date.parse(nextSpinAt) > current) return;
      window.clearInterval(timer);
      if (demo || !supabase || !userId) return;
      void supabase.rpc('wheel_state').then(({ data, error }) => {
        if (error) return;
        setNextSpinAt((data as { next_spin_at?: string | null } | null)?.next_spin_at ?? null);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [nextSpinAt, demo, userId]);
  useEffect(() => {
    if (demo || !supabase || !userId || !settings.wheel_enabled || !wheelEligible) {
      setNextSpinAt(null);
      return;
    }
    const db = supabase;
    let alive = true;
    const load = () => {
      void db.rpc('wheel_state').then(({ data, error }) => {
        if (!alive || error) return;
        setNextSpinAt((data as { next_spin_at?: string | null } | null)?.next_spin_at ?? null);
        setNow(Date.now());
      });
    };
    load();
    const channel = db.channel(`home-wheel-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wheel_spins', filter: `user_id=eq.${userId}` }, load)
      .subscribe();
    window.addEventListener('focus', load);
    return () => { alive = false; window.removeEventListener('focus', load); void db.removeChannel(channel); };
  }, [demo, userId, settings.wheel_enabled, wheelEligible]);
  const contacts = [
    { name: 'WhatsApp', url: safeHttpsLink(whatsappUrl === undefined ? settings.whatsapp_url : whatsappUrl, ['wa.me', 'api.whatsapp.com']), mark: <WhatsAppMark />, className: 'whatsapp', animation: contactAnimations.whatsapp, visible: settings.show_whatsapp },
    { name: 'Recomendar', url: shareUrl, mark: <Send />, className: 'recommend', animation: null, visible: !!shareUrl && settings.show_whatsapp },
    { name: 'Telegram', url: safeHttpsLink(settings.telegram_url, ['t.me']), mark: <TelegramMark />, className: 'telegram', animation: contactAnimations.telegram, visible: settings.show_telegram },
    { name: 'Instagram', url: safeHttpsLink(settings.instagram_url, ['instagram.com', 'www.instagram.com']), mark: <InstagramMark />, className: 'instagram', animation: contactAnimations.instagram, visible: settings.show_instagram },
  ].filter(contact => contact.visible);
  return <>
    <h1 className="home-welcome">¡{greeting}, <span className="home-welcome-name">{name}!</span></h1>
    <HomeBonusCarousel onClaim={onClaimSpecialBonus} />
    <h2 className="section-title">¿Qué querés hacer?</h2>
    <div className="quick-actions">
      {bannerUrl && bannerImage && <a className="action-card home-link-banner" style={bannerStyle} href={bannerUrl} target="_blank" rel="noopener noreferrer" aria-label={`${settings.home_banner_title} (abre en otra pestaña)`}>{bannerImage.startsWith('/') ? <img src={bannerImage} alt={settings.home_banner_title} draggable={false} decoding="async" /> : <StorageImage path={bannerImage} alt={settings.home_banner_title} />}</a>}
      {([
        { id: 'deposit', title: 'Cargar', description: 'Hacé tu depósito y subí el comprobante', Icon: Landmark },
        { id: 'withdrawal', title: 'Retiros', description: 'Solicitá tu retiro', Icon: Link2 },
        { id: 'bonuses', title: 'Bonos', description: 'Elegí tu bono antes de cargar', Icon: Gift },
        { id: 'wheel', title: 'Ruleta', description: 'Girás una vez por día', Icon: Disc },
      ] as const).filter(action => action.id !== 'wheel' || settings.wheel_enabled && wheelEligible).map(({ id, title, description, Icon }) => {
        const detail = id === 'wheel' && wheelWait ? wheelWait : description;
        const cardImagePath = isImageCardSlot(id) ? settings.portal_theme_designs?.[settings.portal_theme]?.[`${id}Path`] : null;
        return <button className="action-card" data-theme-card={id} key={id} aria-label={title} onClick={() => navigate(id)}>{cardImagePath ? <><StorageImage path={cardImagePath} alt="" className="action-card-image" />{id === 'wheel' && wheelWaitClock && <span className="wheel-image-countdown" role="timer">{wheelWaitClock}</span>}</> : <><span className="icon-circle"><Icon /></span><span><strong>{title}</strong><small className={id === 'wheel' && wheelWait ? 'wheel-home-wait' : undefined} role={id === 'wheel' && wheelWait ? 'timer' : undefined}>{detail}</small></span><ChevronRight /></>}</button>;
      })}
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
export function RequestForm({ kind, requests, bank, bankOperation, retryAt = 0, initialBonusId = '', busy, demo, onSubmit, onCopy, onOpenWithdrawalHistory, onBrowseBonuses, feedback }: {
  kind: 'deposit' | 'withdrawal'; requests: RequestRow[]; bank: Bank | null; bankOperation: BankOperationStatus | null; retryAt?: number; initialBonusId?: string; busy: boolean; demo: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>, receipt?: File | null) => void; onCopy: (text: string, label: string) => void; onOpenWithdrawalHistory: () => void; onBrowseBonuses?: () => void; feedback?: ReactNode;
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
  const [bonus, setBonus] = useState(initialBonusId);
  const [rawAmount, setRawAmount] = useState('');
  const [nextLoadNumber, setNextLoadNumber] = useState<number | null>(demo || !supabase ? 1 : null);
  const [loadNumberReady, setLoadNumberReady] = useState(demo || !supabase);
  useEffect(() => { if (kind === 'withdrawal' && pending) setRawAmount(''); }, [kind, pending]);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const receiptChangeId = useRef(0);
  useEffect(() => { if (kind === 'deposit') reloadPromotions(); }, [kind, reloadPromotions]);
  useEffect(() => {
    if (kind !== 'deposit') return;
    if (demo || !supabase) { setNextLoadNumber(1); setLoadNumberReady(true); return; }
    let alive = true;
    const db = supabase;
    async function loadNumber() {
      setLoadNumberReady(false);
      const { data, error } = await db.rpc('player_next_deposit_number');
      if (!alive) return;
      const number = Number(data);
      setNextLoadNumber(error || !Number.isInteger(number) || number < 1 ? null : number);
      setLoadNumberReady(true);
    }
    void loadNumber();
    return () => { alive = false; };
  }, [kind, demo]);
  const typedAmount = kind === 'deposit' ? readMoney(rawAmount) : null;
  const depositAmountValid = kind !== 'deposit' || typedAmount !== null && typedAmount >= 1000;
  const selectedOffer = promotions.find(offer => offer.id === bonus && offer.selectable);
  const loadNumberEligible = !!selectedOffer && nextLoadNumber !== null && nextLoadNumber >= selectedOffer.load_number_from
    && (selectedOffer.load_number_to === null || nextLoadNumber <= selectedOffer.load_number_to);
  const bonusValid = !!selectedOffer && loadNumberEligible && typedAmount !== null && (selectedOffer.reward_type === 'free_spins'
    ? typedAmount >= selectedOffer.min_amount && typedAmount <= selectedOffer.max_amount
    : bonusEnabled(asBonusRule(selectedOffer), typedAmount));
  const bonusIdForForm = loadNumberEligible && selectedOffer?.cooldown_hours && selectedOffer.cooldown_hours > 0 && selectedOffer.reward_type === 'cash' ? selectedOffer.id : bonusValid ? selectedOffer?.id ?? '' : '';
  const bonusCredit = bonusValid && selectedOffer?.reward_type !== 'free_spins' && selectedOffer ? creditAmounts(typedAmount!, selectedOffer.bonus_mode === 'percent' ? selectedOffer.bonus_percent : 0, selectedOffer.bonus_mode === 'fixed' ? selectedOffer.bonus_amount : 0).bonus : 0;
  const bonusCreditLabel = bonusCredit > 0 ? `+ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(bonusCredit)}` : '';
  useEffect(() => { if (bonus && !promotions.some(offer => offer.id === bonus && offer.selectable)) setBonus(''); }, [promotions, bonus]);
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
  const amountBelowMinimum = kind === 'deposit' && typedAmount !== null && typedAmount < 1000;
  const amount = <label className="amount-label">Monto a {kind === 'deposit' ? 'cargar' : 'retirar'}<span className="amount-input">{(kind !== 'deposit' || rawAmount) && <span aria-hidden="true">$</span>}<input className="amount" name="amount" inputMode="decimal" type="text" pattern={moneyInputPattern} maxLength={moneyInputMaxLength} placeholder={kind === 'deposit' ? 'Mínimo 1.000' : '10.000'} aria-label={`Monto a ${kind === 'deposit' ? 'cargar' : 'retirar'} en pesos argentinos`} required value={rawAmount} onChange={event => setRawAmount(event.target.value)} />{bonusCreditLabel && <span className="amount-bonus">{bonusCreditLabel}</span>}</span>{kind === 'deposit' && <small className={amountBelowMinimum ? 'amount-minimum-error' : 'amount-minimum-note'} role={amountBelowMinimum ? 'alert' : undefined}>{amountBelowMinimum ? 'El monto mínimo para cargar es de $1.000.' : 'La carga mínima es de $1.000.'}</small>}{kind === 'withdrawal' && withdrawalPartCount > 1 && <small className="withdrawal-split-note">{withdrawalPartCount > 100 ? 'El máximo por solicitud es de $10.000.000.' : `Se pagará en ${withdrawalPartCount} transferencias de hasta ${money(100000)}. Cada pago tendrá su comprobante en el historial.`}</small>}</label>;
  return <form className="request-form" onSubmit={event => {
    if (kind === 'deposit' && !depositAmountValid) { event.preventDefault(); return; }
    onSubmit(event, kind === 'deposit' ? file : null);
  }}>
    {kind === 'deposit' ? <>
      <input type="hidden" name="bank_assignment_id" value={bank?.assignment_id ?? ''} />
      <input type="hidden" name="bonus_id" value={bonusIdForForm} />
      {!bank && bankOperation && bankOperation.mode !== 'online' ? <BankPause status={bankOperation} now={now} /> : bank ? <BankTransferCard bank={bank} onCopy={onCopy} /> : <section className="card bank-loading-card" aria-live="polite"><Landmark /><div><strong>Preparando una cuenta</strong><small>Esperá un momento…</small></div></section>}
      <section className="card deposit-amount">
        {selectedOffer ? <div className="deposit-selected-bonus"><div><strong>{selectedOffer.title}</strong><small>{selectedOffer.reward_type === 'free_spins' ? selectedOffer.reward_label : selectedOffer.bonus_mode === 'fixed' ? `+${money(selectedOffer.bonus_amount)}` : `+${percentText(selectedOffer.bonus_percent)}%`} · desde {money(selectedOffer.min_amount)} hasta {money(selectedOffer.max_amount)} · {selectedOffer.load_number_to === null ? selectedOffer.load_number_from === 1 ? 'todas las cargas' : `desde carga ${selectedOffer.load_number_from}` : selectedOffer.load_number_from === selectedOffer.load_number_to ? `solo carga ${selectedOffer.load_number_from}` : `cargas ${selectedOffer.load_number_from}–${selectedOffer.load_number_to}`}</small></div><button type="button" onClick={() => setBonus('')}>Quitar</button></div> : <div className="deposit-bonus-empty"><span>¿Querés sumar un bono a tu carga?</span>{onBrowseBonuses && <button type="button" onClick={onBrowseBonuses}><Gift size={17} /> Elegir bono</button>}</div>}
        {amount}
        {selectedOffer && !bonusValid && (typedAmount !== null || !loadNumberEligible) && <p className={`deposit-bonus-note${selectedOffer.cooldown_hours > 0 ? ' is-special' : ''}`}>{!loadNumberReady ? 'Verificando tu número de carga…' : nextLoadNumber === null ? 'No pudimos verificar tu número de carga. Recargá la página; la carga se enviará sin bono.' : !loadNumberEligible ? `Este bono no aplica a tu carga n.º ${nextLoadNumber}. La carga se enviará sin bono.` : selectedOffer.reward_type === 'free_spins' ? 'Este monto está fuera del rango del premio. La carga se enviará sin giros gratis.' : selectedOffer.cooldown_hours > 0 ? 'Este bono especial se enviará para revisión. Si el monto no cumple las condiciones, podrán acreditar la carga sin el bono.' : 'Este monto está fuera del rango del bono. La carga se enviará sin bono.'}</p>}
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
    <button className="primary" disabled={busy || demo || withdrawalBlocked || withdrawalPartCount > 100 || pendingDeposit || compressing || depositRetrySeconds > 0 || (kind === 'deposit' && (!depositAmountValid || !file || !bank || (!!selectedOffer && !loadNumberReady)))} aria-describedby={pendingDeposit ? 'deposit-pending-message' : undefined}>{compressing ? 'Optimizando…' : busy ? kind === 'deposit' ? 'Enviando solicitud…' : 'Enviando…' : depositRetrySeconds > 0 ? `Esperá ${depositRetryCountdown}` : kind === 'deposit' ? 'Solicitar carga' : 'Solicitar retiro'}</button>
    {pendingDeposit && <p id="deposit-pending-message" className="deposit-pending-message" role="status">Tu carga ya está en proceso. Podrás solicitar otra cuando sea aprobada.</p>}
  </form>;
}
export function Conversation({ messages, userId, busy, disabled, open, onOpenChange, onSubmit }: { messages: Message[]; userId: string; busy: boolean; disabled: boolean; open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const log = useRef<HTMLElement>(null);
  const nearBottom = useRef(true);
  const [image, setImage] = useState<File | null>(null);
  const imagePreview = useChatImagePreview(image);
  const imageInput = useRef<HTMLInputElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const messageInput = useRef<HTMLInputElement>(null);
  const widget = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const alignToPortal = () => {
      const portal = widget.current?.closest('.user-app');
      if (!portal || !widget.current) return;
      const bounds = portal.getBoundingClientRect();
      const gap = Math.min(18, Math.max(12, bounds.width * .04));
      widget.current.style.right = `${Math.max(12, window.innerWidth - bounds.right + gap)}px`;
    };
    alignToPortal();
    const portal = widget.current?.closest('.user-app');
    const observer = portal && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(alignToPortal) : null;
    if (portal && observer) observer.observe(portal);
    window.addEventListener('resize', alignToPortal);
    window.addEventListener('orientationchange', alignToPortal);
    return () => { observer?.disconnect(); window.removeEventListener('resize', alignToPortal); window.removeEventListener('orientationchange', alignToPortal); };
  }, []);
  useEffect(() => {
    const root = widget.current;
    if (!root) return;
    let frame = 0;
    const portal = root.closest('.user-app');
    const alignToWheel = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!root.closest('.user-app.page-home')) { root.style.removeProperty('bottom'); return; }
        const wheelCard = root.closest('.user-app')?.querySelector<HTMLElement>('.action-card[data-theme-card="wheel"]');
        if (!wheelCard) { root.style.bottom = 'max(108px, calc(env(safe-area-inset-bottom) + 88px))'; return; }
        const rect = wheelCard.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= window.innerHeight) { root.style.bottom = 'max(108px, calc(env(safe-area-inset-bottom) + 88px))'; return; }
        const launcherHeight = 50;
        const desiredTop = rect.bottom + 30;
        const visibleTop = Math.min(desiredTop, window.innerHeight - launcherHeight);
        root.style.bottom = `${Math.max(0, window.innerHeight - visibleTop - launcherHeight)}px`;
      });
    };
    const mutationObserver = portal && typeof MutationObserver !== 'undefined' ? new MutationObserver(alignToWheel) : null;
    if (portal && mutationObserver) mutationObserver.observe(portal, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    const resizeObserver = portal && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(alignToWheel) : null;
    if (portal && resizeObserver) resizeObserver.observe(portal);
    alignToWheel();
    window.addEventListener('resize', alignToWheel, { passive: true });
    window.addEventListener('scroll', alignToWheel, { passive: true });
    window.visualViewport?.addEventListener('resize', alignToWheel, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', alignToWheel);
      window.removeEventListener('scroll', alignToWheel);
      window.visualViewport?.removeEventListener('resize', alignToWheel);
      root.style.removeProperty('bottom');
    };
  }, []);
  useEffect(() => { if (open && log.current && nearBottom.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, open]);
  useEffect(() => { if (open) messageInput.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { onOpenChange(false); launcher.current?.focus(); } };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onOpenChange]);
  return <div ref={widget} className={`player-chat-widget${open ? ' is-open' : ''}`}>
    <section className="player-chat-panel" role="dialog" aria-label="Chat de soporte Gana777bet.com" hidden={!open}>
      <header className="player-chat-head">
        <img className="player-chat-avatar" src="https://gana777bet.online/support-chat-avatar.webp" alt="" />
        <div className="player-chat-identity"><strong>Soporte Gana777bet.com</strong><small>Atención al cliente</small></div>
        <button className="player-chat-close" type="button" aria-label="Cerrar chat" onClick={() => { onOpenChange(false); launcher.current?.focus(); }}><X size={20} /></button>
      </header>
      <section ref={log} className="player-chat-log" role="log" aria-label="Conversación con soporte" aria-live="polite" onScroll={e => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        <div className="chat-date"><span>Tu conversación</span></div>
        {!messages.length && <p className="player-chat-welcome">¡Hola! Bienvenido a GANA777.<br />¿En qué podemos ayudarte?</p>}
        {messages.map(m => <div className={`message ${m.sender_id === userId ? 'mine' : ''}`} key={m.id}><p>{m.body === 'Imagen adjunta' && m.attachment_path ? '' : m.body}{m.attachment_path && <ChatImage path={m.attachment_path} />}</p><small>{date(m.created_at)}</small></div>)}
      </section>
      <form className="composer chat-composer" onSubmit={onSubmit} onReset={() => setImage(null)}>{imagePreview && <div className="chat-image-preview"><img src={imagePreview} alt="Imagen seleccionada" /><span>{image?.name}</span><button type="button" aria-label="Quitar imagen" onClick={() => { setImage(null); if (imageInput.current) imageInput.current.value = ''; }}><Trash2 size={16} /></button></div>}<input ref={imageInput} className="chat-file-input" name="image" type="file" accept="image/*" disabled={busy || disabled} onChange={event => setImage(event.target.files?.[0] ?? null)} /><button type="button" className="chat-gallery-button" aria-label="Adjuntar imagen de la galería" disabled={busy || disabled} onClick={() => imageInput.current?.click()}><Images size={20} /></button><input ref={messageInput} className="player-chat-message" name="message" aria-label="Mensaje" placeholder="Escribí un mensaje…" maxLength={2000} autoComplete="off" enterKeyHint="send" required={!image} disabled={busy || disabled} /><button className="send" aria-label="Enviar mensaje" disabled={busy || disabled}><Send size={21} /></button></form>
    </section>
    <button ref={launcher} className="player-chat-launcher" type="button" aria-label={open ? 'Cerrar chat de soporte' : 'Abrir chat de soporte'} aria-expanded={open} onClick={() => onOpenChange(!open)}><MessageCircle size={22} /><span>CHAT</span></button>
  </div>;
}
