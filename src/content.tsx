import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import { asBonusRule } from '../supabase/functions/_shared/bonus-rule';
import { supabase } from './lib';
import { defaultHomeBanner, homeBannerLayoutStyles, type HomeBannerSettings } from './home-banner';
import { bonusBannerLayout } from './bonus-banner-layout';
import { portalBannersFor, type PortalBannerPlace } from './portal-banners';
import type { PortalTheme, ThemeDesigns } from './portal-theme-design';
import { themeBase } from './portal-theme-design';
import pandaLogin from './assets/panda-login-transparent.png';
import pandaAvatar from './assets/panda-user-avatar.png';

export type { PortalTheme } from './portal-theme-design';
export type AppContent = HomeBannerSettings & {
  id: boolean;
  portal_theme: PortalTheme;
  portal_theme_designs: ThemeDesigns;
  logo_path: string | null;
  portal_header_logo_path: string | null;
  portal_header_logo_halloween_path: string | null;
  portal_header_logo_layouts: Record<string, unknown>;
  login_image_path: string;
  login_image_layout: 'reference' | 'image';
  whatsapp_url: string | null;
  telegram_url: string | null;
  instagram_url: string | null;
  help_url: string | null;
  show_whatsapp: boolean;
  show_telegram: boolean;
  show_instagram: boolean;
  allow_player_logout: boolean;
  wheel_enabled: boolean;
  home_bonus_media_path: string | null;
  home_bonus_halloween_media_path: string | null;
  home_bonus_layouts: Record<string, unknown>;
  portal_banners: unknown;
  home_banners_visible: boolean;
  deposit_bonus_button_path: string | null;
};
export type Promotion = {
  id: string; title: string; description: string; image_path: string | null;
  rules_text: string;
  reward_type: 'cash' | 'free_spins'; reward_label: string;
  image_layout: 'reference' | 'image'; bonus_mode: 'percent' | 'fixed'; bonus_percent: number;
  bonus_amount: number; min_amount: number; max_amount: number;
  load_number_from: number; load_number_to: number | null;
  cooldown_hours: number; daily_reset_time: string | null; banner_layout: unknown;
  active: boolean; show_banner: boolean; selectable: boolean; sort_order: number;
};
export type ContactChannel = 'whatsapp' | 'telegram' | 'instagram';
const emptyAnimations: Record<ContactChannel, string | null> = { whatsapp: null, telegram: null, instagram: null };
const defaults: AppContent = {
  ...defaultHomeBanner,
  id: true, portal_theme: 'base', portal_theme_designs: {}, logo_path: null, portal_header_logo_path: null, portal_header_logo_halloween_path: null, portal_header_logo_layouts: {}, login_image_path: 'brand/panda-login-transparent.png',
  login_image_layout: 'image', whatsapp_url: null, telegram_url: null,
  instagram_url: null, help_url: null, show_whatsapp: true, show_telegram: true, show_instagram: true, allow_player_logout: false, wheel_enabled: false, home_bonus_media_path: null, home_bonus_halloween_media_path: null, home_bonus_layouts: {}, portal_banners: [], home_banners_visible: true, deposit_bonus_button_path: null,
};
const loadBonusPromotionId = '00000000-0000-4000-8000-000000000777';
const welcome: Promotion = {
  id: loadBonusPromotionId, title: 'Bonos por carga',
  description: 'Desde $5.000 recibís $1.000 y desde $10.000 recibís $2.000.',
  image_path: null, image_layout: 'image',
  reward_type: 'cash', reward_label: '', rules_text: '',
  bonus_mode: 'percent', bonus_percent: 0, bonus_amount: 0, min_amount: 0, max_amount: 0, load_number_from: 1, load_number_to: null, cooldown_hours: 0, daily_reset_time: null, banner_layout: {},
  active: true, show_banner: true, selectable: false, sort_order: 0,
};
const promotionColumns = 'id,title,description,image_path,image_layout,reward_type,reward_label,rules_text,bonus_percent,bonus_mode,bonus_amount,min_amount,max_amount,load_number_from,load_number_to,cooldown_hours,daily_reset_time,banner_layout,active,show_banner,selectable,sort_order';
const legacyPromotionColumns = 'id,title,description,image_path,image_layout,bonus_percent,active,show_banner,selectable,sort_order';
function toPromotion(row: {
  id: string; title: string; description?: string | null; image_path?: string | null; image_layout?: string | null;
  reward_type?: string | null; reward_label?: string | null;
  rules_text?: string | null;
  bonus_mode?: string | null; bonus_percent?: number | null; bonus_amount?: number | null; min_amount?: number | null; max_amount?: number | null;
  load_number_from?: number | null; load_number_to?: number | null;
  cooldown_hours?: number | null; daily_reset_time?: string | null; banner_layout?: unknown;
  active?: boolean | null; show_banner?: boolean | null; selectable?: boolean | null; sort_order?: number | null;
}): Promotion {
  return {
    id: row.id, title: row.title, description: row.description ?? '', image_path: row.image_path ?? null,
    reward_type: row.reward_type === 'free_spins' ? 'free_spins' : 'cash', reward_label: row.reward_label ?? '',
    rules_text: row.rules_text ?? '',
    image_layout: row.image_layout === 'reference' ? 'reference' : 'image', ...asBonusRule(row),
    load_number_from: Number(row.load_number_from) || 1, load_number_to: row.load_number_to == null ? null : Number(row.load_number_to),
    cooldown_hours: Number(row.cooldown_hours) || 0, daily_reset_time: row.daily_reset_time ?? null, banner_layout: row.banner_layout ?? {},
    active: !!row.active, show_banner: !!row.show_banner, selectable: !!row.selectable, sort_order: row.sort_order ?? 0,
  };
}
const ContentContext = createContext({ settings: defaults, promotions: [welcome], contactAnimations: emptyAnimations, reloadPromotions: () => {}, initialReady: !supabase, initialError: '', retryInitialLoad: () => {} });
export const useContent = () => useContext(ContentContext);
function preloadImage(path: string | null | undefined) {
  if (!path || !supabase) return Promise.resolve();
  const url = supabase.storage.from('app-assets').getPublicUrl(path).data.publicUrl;
  return new Promise<void>(resolve => {
    const image = new Image();
    const finish = () => { image.onload = null; image.onerror = null; resolve(); };
    const timeout = window.setTimeout(finish, 6000);
    image.onload = () => { window.clearTimeout(timeout); finish(); };
    image.onerror = () => { window.clearTimeout(timeout); finish(); };
    image.src = url;
    if (image.complete) { window.clearTimeout(timeout); finish(); }
  });
}
export function ContentProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(defaults);
  const [promotions, setPromotions] = useState<Promotion[]>([welcome]);
  const [contactAnimations, setContactAnimations] = useState(emptyAnimations);
  const [initialReady, setInitialReady] = useState(!supabase);
  const [initialError, setInitialError] = useState('');
  const initialSettled = useRef(!supabase);
  const reloadRef = useRef<() => void>(() => {});
  const reloadPromotions = useCallback(() => { reloadRef.current(); }, []);
  const retryInitialLoad = useCallback(() => {
    initialSettled.current = false;
    setInitialError('');
    setInitialReady(false);
    reloadRef.current();
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const db = supabase;
    let alive = true;
    async function refresh() {
      const [config, promos, contacts] = await Promise.all([
        db.from('app_settings').select('*').eq('id', true).maybeSingle(),
        db.from('promotions').select(promotionColumns).eq('active', true).order('sort_order'),
        db.from('contact_animations').select('channel,animation_path'),
      ]);
      if (!alive) return;
      if (!config.error && config.data) {
        const saved = { ...defaults, ...config.data } as AppContent;
        if (!initialSettled.current) {
          const design = saved.portal_theme_designs?.[saved.portal_theme];
          const paths = [...new Set([
            saved.login_image_path, saved.logo_path, saved.portal_header_logo_path,
            saved.portal_theme === 'halloween' ? saved.portal_header_logo_halloween_path : null,
            design?.backgroundPath, design?.logoPath,
          ].filter((path): path is string => typeof path === 'string' && path.length > 0))];
          await Promise.all(paths.map(preloadImage));
          if (!alive) return;
        }
        // Upgrade the initial screenshot reference without requiring a SQL change.
        setSettings(saved.login_image_path === 'brand/login-reference.png'
          ? { ...saved, login_image_path: defaults.login_image_path, login_image_layout: 'image' }
          : saved);
        setInitialError('');
      } else if (!initialSettled.current) {
        setInitialError('No pudimos cargar la configuración del portal. Revisá tu conexión e intentá de nuevo.');
      }
      if (promos.error && /bonus_mode|bonus_amount|min_amount|max_amount|load_number_from|load_number_to|cooldown_hours|banner_layout|reward_type|reward_label|rules_text/i.test(promos.error.message ?? '')) {
        const legacy = await db.from('promotions').select(legacyPromotionColumns).eq('active', true).order('sort_order');
        if (!alive) return;
        if (!legacy.error) setPromotions((legacy.data ?? []).map(row => toPromotion(row)));
      } else if (!promos.error) setPromotions((promos.data ?? []).map(row => toPromotion(row)));
      if (!contacts.error) {
        const next = { ...emptyAnimations };
        for (const row of contacts.data ?? []) {
          if (row.channel === 'whatsapp' || row.channel === 'telegram' || row.channel === 'instagram') next[row.channel as ContactChannel] = row.animation_path;
        }
        setContactAnimations(next);
      }
      initialSettled.current = true;
      setInitialReady(true);
    }
    reloadRef.current = () => { void refresh(); };
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const channel = db.channel('user-content')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promotions' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_animations' }, () => void refresh())
      .subscribe();
    return () => { alive = false; window.removeEventListener('focus', onFocus); void db.removeChannel(channel); };
  }, []);
  return <ContentContext.Provider value={{ settings, promotions, contactAnimations, reloadPromotions, initialReady, initialError, retryInitialLoad }}>{children}</ContentContext.Provider>;
}

// Local fallbacks keep the core character assets available before Storage responds.
const previewFiles: Record<string, string> = {
  'brand/panda-login-transparent.png': pandaLogin,
  'brand/panda-login-bright.png': pandaLogin,
  'avatars/panda-user-avatar.png': pandaAvatar,
};
export function StorageImage({ path, alt, className = '', fallbackPath }: { path: string; alt: string; className?: string; fallbackPath?: string }) {
  const remote = supabase?.storage.from('app-assets').getPublicUrl(path).data.publicUrl;
  const local = previewFiles[path] ?? (fallbackPath ? previewFiles[fallbackPath] : undefined);
  const [loadedRemote, setLoadedRemote] = useState<string | null>(null);
  useEffect(() => {
    if (!remote || !local) return;
    let alive = true;
    const image = new Image();
    image.onload = () => { if (alive) setLoadedRemote(remote); };
    image.src = remote;
    return () => { alive = false; image.onload = null; };
  }, [remote, local]);
  const source = local ? (loadedRemote === remote ? remote : local) : remote;
  if (!source) return null;
  return <img className={className} src={source} alt={alt} draggable={false} decoding="async"
    onError={() => { if (source === remote && local) setLoadedRemote(null); }} />;
}
export function BonusBanner() {
  const { promotions, settings } = useContent();
  const promotion = promotions.find(p => p.show_banner);
  if (!promotion) return null;
  const layoutStyle = homeBannerLayoutStyles(bonusBannerLayout(settings, settings.portal_theme)) as CSSProperties;
  const designPath = settings.portal_theme_designs?.[settings.portal_theme]?.bonusPath;
  if (designPath) {
    const video = /\.(mp4|webm)$/i.test(designPath);
    return <section className="bonus-banner image-banner custom-bonus-media" style={layoutStyle} aria-label={promotion.title}>
      {video ? <video key={designPath} className="bonus-image" src={supabase?.storage.from('app-assets').getPublicUrl(designPath).data.publicUrl} autoPlay muted loop playsInline preload="metadata" aria-label={promotion.title} /> : <StorageImage key={designPath} path={designPath} alt={promotion.title} className="bonus-image" />}
    </section>;
  }
  const visualTheme = themeBase(settings);
  if (visualTheme === 'dark') return <section className="bonus-banner image-banner dark-bonus-banner" style={layoutStyle} aria-label="Bonos por carga">
    <img className="bonus-image" src="/preview-assets/dark-bonus-banner-card.png" alt="Bonos por carga: desde $5.000 recibís $1.000 y desde $10.000 recibís $2.000" draggable={false} decoding="async" />
    <video className="bonus-image" src="/preview-assets/dark-bonus-banner.mp4" poster="/preview-assets/dark-bonus-banner-card.png" autoPlay muted loop playsInline preload="metadata" aria-hidden="true" onPlaying={event => { event.currentTarget.dataset.ready = 'true'; }} />
  </section>;
  if (visualTheme === 'halloween' && ((settings.portal_theme === 'halloween' && settings.home_bonus_halloween_media_path) || promotion.id === loadBonusPromotionId)) {
    const path = settings.portal_theme === 'halloween' ? settings.home_bonus_halloween_media_path : null;
    const video = path ? /\.(mp4|webm)$/i.test(path) : false;
    return <section className={`bonus-banner image-banner halloween-bonus-banner${path ? ' custom-bonus-media' : ''}`} style={layoutStyle} aria-label={promotion.title}>
      {path ? video ? <video key={path} className="bonus-image" src={supabase?.storage.from('app-assets').getPublicUrl(path).data.publicUrl} poster="/preview-assets/halloween-bonus-banner.webp" autoPlay muted loop playsInline preload="metadata" aria-label={promotion.title} /> : <StorageImage key={path} path={path} alt={promotion.title} className="bonus-image" /> : <><img className="bonus-image" src="/preview-assets/halloween-bonus-banner.webp" alt="Panda disfrazado de Halloween con una calabaza" draggable={false} decoding="async" /><div className="bonus-offer-copy"><span>Cargá y sumá más</span><strong>Bonos por carga</strong><div className="bonus-offer-tiers"><p>Desde <b>$5.000</b><small>Recibís +$1.000</small></p><p>Desde <b>$10.000</b><small>Recibís +$2.000</small></p></div></div></>}
    </section>;
  }
  if (settings.home_bonus_media_path) {
    const path = settings.home_bonus_media_path;
    const video = /\.(mp4|webm)$/i.test(path);
    return <section className="bonus-banner image-banner custom-bonus-media" style={layoutStyle} aria-label={promotion.title}>
      {video ? <video key={path} className="bonus-image" src={supabase?.storage.from('app-assets').getPublicUrl(path).data.publicUrl} poster="/preview-assets/load-bonus-banner-v2.webp" autoPlay muted loop playsInline preload="metadata" aria-label={promotion.title} /> : <StorageImage key={path} path={path} alt={promotion.title} className="bonus-image" />}
    </section>;
  }
  if (promotion.image_path) return <section className="bonus-banner image-banner has-copy" style={layoutStyle} aria-label={promotion.title}>
    <StorageImage key={promotion.image_path} path={promotion.image_path} alt={promotion.title} className="bonus-image" />
    <div className="bonus-image-copy"><strong>{promotion.title}</strong>{promotion.description && <p>{promotion.description}</p>}</div>
  </section>;
  if (visualTheme === 'christmas' && promotion.id === loadBonusPromotionId) return <section className="bonus-banner image-banner christmas-bonus-banner" style={layoutStyle} aria-label="Bonos por carga">
    <img className="bonus-image" src="/preview-assets/christmas-bonus-banner.webp" alt="Panda con traje de Papá Noel y regalos" draggable={false} decoding="async" />
    <div className="bonus-offer-copy">
      <span>Cargá y sumá más</span><strong>Bonos por carga</strong>
      <div className="bonus-offer-tiers"><p>Desde <b>$5.000</b><small>Recibís +$1.000</small></p><p>Desde <b>$10.000</b><small>Recibís +$2.000</small></p></div>
    </div>
  </section>;
  if (promotion.id === loadBonusPromotionId) return <section className="bonus-banner image-banner has-copy default-bonus-banner" style={layoutStyle} aria-label={promotion.title}>
    <img className="bonus-image" src="/preview-assets/load-bonus-banner-v2.webp" alt={promotion.title} draggable={false} decoding="async" />
    <div className="bonus-offer-copy">
      <span>Cargá y sumá más</span><strong>Bonos por carga</strong>
      <div className="bonus-offer-tiers"><p>Desde <b>$5.000</b><small>Recibís +$1.000</small></p><p>Desde <b>$10.000</b><small>Recibís +$2.000</small></p></div>
    </div>
  </section>;
  return <section className={`bonus-banner ${promotion.image_layout === 'reference' ? 'reference-banner' : ''}`} style={layoutStyle} aria-label={promotion.title}>
    <div className="bonus-copy"><strong>{promotion.title}</strong><p>{promotion.description}</p></div>
  </section>;
}
export function PortalBanners({ place }: { place: PortalBannerPlace }) {
  const { settings } = useContent();
  const banners = portalBannersFor(settings.portal_banners, settings.portal_theme, place);
  if (!banners.length) return null;
  const label = place === 'withdrawal' ? 'Banner de retiros' : 'Banner del inicio';
  return <div className="portal-extra-banners">{banners.map((banner, index) => {
    const video = /\.(mp4|webm)$/i.test(banner.path);
    const source = supabase?.storage.from('app-assets').getPublicUrl(banner.path).data.publicUrl;
    const text = `${label} ${index + 1}`;
    return <section className="portal-extra-banner" style={homeBannerLayoutStyles(banner.layout) as CSSProperties} key={banner.id} aria-label={text}>
      {video ? <video className="bonus-image" src={source} autoPlay muted loop playsInline preload="metadata" aria-label={text} /> : <StorageImage path={banner.path} alt={text} className="bonus-image" />}
    </section>;
  })}</div>;
}
