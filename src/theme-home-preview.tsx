import { useLayoutEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChevronRight, Landmark, Link2, MessageCircle } from 'lucide-react';
import { StorageImage } from './content';
import { supabase } from './lib';
import { ModernAccountButton, ModernBrand, ModernHomeBody } from './modern-home';
import { isImageCardSlot, themeBase, themeSurface, type PortalTheme, type ThemeDesigns } from './portal-theme-design';

const previewActions = [
  { id: 'deposit', title: 'Cargar', description: 'Hacé tu depósito y subí el comprobante', Icon: Landmark },
  { id: 'withdrawal', title: 'Retiros', description: 'Solicitá tu retiro', Icon: Link2 },
  { id: 'chat', title: 'Chat', description: 'Escribí a soporte', Icon: MessageCircle },
] as const;

const previewReset = '.user-app.page-home{min-height:0}';

function stylesheetText(): string {
  const chunks = [previewReset];
  for (const sheet of document.styleSheets) {
    try {
      chunks.push([...sheet.cssRules].map(rule => rule.cssText).join('\n'));
    } catch {
      // A sheet from another origin cannot be copied. The app styles are same-origin.
    }
  }
  chunks.push(previewReset);
  return chunks.join('\n');
}

function PreviewHome({ theme, designs }: { theme: PortalTheme; designs: ThemeDesigns }) {
  const settings = { portal_theme: theme, portal_theme_designs: designs };
  const surface = themeSurface(settings, path => supabase?.storage.from('app-assets').getPublicUrl(path).data.publicUrl ?? null);
  const base = themeBase(settings);
  const halloween = base === 'halloween';
  if (base === 'modern') return <div className={`user-app page-home ${surface.className}`} style={surface.style}>
    <header className="home-header"><ModernBrand /><ModernAccountButton /></header>
    <ModernHomeBody name="Jugador" />
  </div>;
  return <div className={`user-app page-home ${surface.className}`} style={surface.style}>
    <header className="home-header">
      <span className={`brand${halloween ? ' halloween-brand' : ''}`}>{halloween ? <>Gana<span>777</span><small>bet.com</small></> : <>GANA<span>777</span></>}</span>
      <span className="home-profile-button"><span className="user-avatar"><StorageImage path="avatars/panda-user-avatar.png" alt="" /></span><span className="home-profile-name">Jugador</span><ChevronRight size={16} aria-hidden="true" /></span>
    </header>
    <h1 className="home-welcome">¡Hola, <span className="home-welcome-name">Jugador</span>!</h1>
    <div className="home-bonus-carousel" aria-hidden="true"><section className="bonus-banner image-banner"><img className="bonus-image" src="/preview-assets/load-bonus-banner-v2.webp" alt="" /></section></div>
    <h2 className="section-title">¿Qué querés hacer?</h2>
    <div className="quick-actions">
      {previewActions.map(({ id, title, description, Icon }) => {
        const imagePath = isImageCardSlot(id) ? designs[theme]?.[`${id}Path`] : null;
        return <button className="action-card" data-theme-card={id} type="button" key={id} tabIndex={-1}>{imagePath ? <StorageImage path={imagePath} alt="" className="action-card-image" /> : <><span className="icon-circle"><Icon /></span><span><strong>{title}</strong><small>{description}</small></span><ChevronRight /></>}</button>;
      })}
    </div>
    <section className="card contacts"><h2>Contactanos</h2><div className="contact-links"><span className="social whatsapp"><span className="social-mark">WA</span><span className="social-name">WhatsApp</span></span></div></section>
  </div>;
}

export function ThemeHomePreview({ theme, designs }: { theme: PortalTheme; designs: ThemeDesigns }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<Root | null>(null);
  const previewRef = useRef({ theme, designs });
  previewRef.current = { theme, designs };
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    let style = shadow.querySelector('style');
    if (!style) {
      style = document.createElement('style');
      style.textContent = stylesheetText();
      shadow.append(style);
    }
    let mount = shadow.querySelector<HTMLDivElement>('#theme-preview-mount');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'theme-preview-mount';
      shadow.append(mount);
    }
    const root = createRoot(mount);
    rootRef.current = root;
    const current = previewRef.current;
    root.render(<PreviewHome theme={current.theme} designs={current.designs} />);
    return () => {
      root.unmount();
      rootRef.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    rootRef.current?.render(<PreviewHome theme={theme} designs={designs} />);
  }, [theme, designs]);
  return <div ref={hostRef} className="theme-live-preview-host" aria-hidden="true" />;
}
