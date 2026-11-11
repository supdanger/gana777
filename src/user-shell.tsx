import { lazy, Suspense, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ChevronRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserPlus, UserRound } from 'lucide-react';
import { StorageImage, useContent } from './content';
import { supabase } from './lib';
import { Turnstile } from './turnstile';
import { PlayerFooter } from './player-legal';
import { PortalInstall } from './portal-install';
import { headerLogoLayout, headerLogoStyle } from './header-logo-layout';
import { themeBase, themeSurface } from './portal-theme-design';
import { ModernAccountButton, ModernBrand } from './modern-home';
import { ViewLoading } from './async-view';
const PlayerAccessRequest = lazy(() => import('./player-access').then(module => ({ default: module.PlayerAccessRequest })));

export type Page = 'home' | 'profile' | 'deposit' | 'withdrawal' | 'referrals' | 'wheel' | 'history' | 'users' | 'link' | 'platform' | 'access-requests' | 'contacts' | 'portal' | 'themes' | 'bonuses' | 'accounts' | 'shifts' | 'chat' | 'external-chat' | 'external-chat-admin' | 'cashiers' | 'announcements' | 'telegram';
export const titles = { home: 'Inicio', profile: 'Mi perfil', deposit: 'Cargas', withdrawal: 'Retiros', referrals: 'Recomendados', wheel: 'Ruleta', history: 'Historial', users: 'Usuarios', link: 'Link', platform: 'Platform', 'access-requests': 'Solicitudes', contacts: 'Contactos', portal: 'Portal', themes: 'Temas', bonuses: 'Bonos', accounts: 'Cuentas', shifts: 'Turnos', chat: 'Chat', 'external-chat': 'Chat externo', 'external-chat-admin': 'Admin', cashiers: 'Cajeros', announcements: 'Mensajes', telegram: 'Telegram' };
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
  const [loginPrefill, setLoginPrefill] = useState<{ username: string; password: string } | null>(null);
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
  return <main className={`login ${admin ? 'admin-login' : `user-login login-refined ${surface.className}${requestingAccess ? ' is-requesting-access' : ''}`}`} style={admin ? undefined : surface.style}>
    {admin && <Brand panel />}
    {admin ? <p className="eyebrow">PANEL DE ADMINISTRACIÓN</p> : <div className={`login-character ${settings.login_image_path === 'brand/panda-login-transparent.png' || settings.login_image_path === 'brand/panda-login-bright.png' ? 'transparent-character' : settings.login_image_layout === 'reference' ? 'reference-character' : ''}`}><StorageImage path={settings.login_image_path} fallbackPath="brand/panda-login-transparent.png" alt="Panda GANA777 con gorra y campera morada" /></div>}
    {!admin && requestingAccess ? <Suspense fallback={<ViewLoading />}><PlayerAccessRequest onBack={() => setRequestingAccess(false)} onCredentialsReady={(username, password) => { setLoginPrefill({ username, password }); setRequestingAccess(false); }} /></Suspense> : <><section className="card login-card">{admin ? <><h1>Bienvenido</h1><p>Ingresá a tu cuenta</p></> : <header className="login-welcome"><span className="brand login-domain-brand">gana777bet.com</span><h1>Bienvenido</h1><p>Ingresá a tu cuenta para continuar.</p></header>}
      <form onSubmit={submit}>
        <label htmlFor="email">{admin ? 'Usuario o correo electrónico' : 'Usuario'}</label>
        <div className="icon-input"><span className="input-icon"><UserRound /></span><input id="email" name="email" type="text" defaultValue={!admin ? loginPrefill?.username : undefined} autoComplete="username" aria-label={admin ? undefined : 'Usuario'} placeholder={admin ? 'Ejemplo: carlos' : 'Usuario'} maxLength={254} autoCapitalize="none" spellCheck={false} required /></div>
        <label htmlFor="password">Contraseña</label>
        <div className="icon-input password"><span className="input-icon"><LockKeyhole /></span><input id="password" name="password" type={visible ? 'text' : 'password'} defaultValue={!admin ? loginPrefill?.password : undefined} autoComplete="current-password" placeholder={admin ? 'Tu contraseña' : 'Contraseña'} maxLength={1024} required /><button type="button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff /> : <Eye />}</button></div>
        {siteKey && <Turnstile siteKey={siteKey} resetKey={captchaReset} onToken={setCaptchaToken} />}
        {feedback}{retrySeconds > 0 && <p className="login-retry" role="status">Podés volver a intentar en {retrySeconds} segundos.</p>}
        <button className="primary" disabled={busy || retrySeconds > 0 || (!!siteKey && !captchaToken)}>{busy ? 'Ingresando…' : retrySeconds > 0 ? 'Esperá para reintentar' : 'Ingresar'}</button>
      </form>
    </section>{!admin && <><p className="login-new-account-label">¿Todavía no tenés cuenta?</p><button type="button" className="player-access-open" onClick={() => setRequestingAccess(true)}><span className="player-access-icon"><UserPlus size={22} aria-hidden="true" /></span><span className="player-access-copy"><strong>Crear usuario</strong><small>Solicitá tu acceso para empezar</small></span><ChevronRight className="player-access-arrow" size={20} aria-hidden="true" /></button></>}</>}
    {!admin && <PortalInstall />}
    {(!configured || import.meta.env.DEV) && <button className="text-button" onClick={onDemo}>Explorar vista previa</button>}
    {admin ? <footer><span className="secure-connection"><ShieldCheck size={17} /> Conexión segura · GANA777 Panel</span></footer> : <PlayerFooter />}
  </main>;
}
export function UserHeader({ page, navigate, name = 'Mi perfil' }: { page: Page; navigate: (page: Page) => void; name?: string }) {
  const { settings } = useContent();
  const modernHome = page === 'home' && themeBase(settings) === 'modern';
  const modernTitle = themeBase(settings) === 'modern';
  const pageTitle = modernTitle && page === 'deposit' ? 'Cargar saldo' : modernTitle && page === 'withdrawal' ? 'Retirar dinero' : titles[page];
  return <header className={page === 'home' ? 'home-header' : 'inner-header'}>
    {modernHome ? <><ModernBrand /><ModernAccountButton onClick={() => navigate('profile')} /></> : page === 'home' ? <><Brand homeHeader /><button className="home-profile-button" onClick={() => navigate('profile')} aria-label={`Ver perfil e historial de ${name}`}><span className="user-avatar"><StorageImage path="avatars/panda-user-avatar.png" alt="" /></span><span className="home-profile-name">{name}</span><ChevronRight size={16} aria-hidden="true" /></button></> : <><button className="back-button" aria-label="Volver al inicio" onClick={() => navigate('home')}><ArrowLeft /></button><h1>{pageTitle}</h1>{!(themeBase(settings) === 'modern' && (page === 'deposit' || page === 'withdrawal')) && <Brand />}</>}
  </header>;
}
