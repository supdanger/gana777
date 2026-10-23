import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { asBonusRule } from '../supabase/functions/_shared/bonus-rule';
import { supabase } from './lib';
import { defaultHomeBanner, type HomeBannerSettings } from './home-banner';
import pandaLogin from './assets/panda-login-transparent.png';
import pandaAvatar from './assets/panda-user-avatar.png';

export type AppContent = HomeBannerSettings & {
  id: boolean;
  logo_path: string | null;
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
  home_bonus_media_path: string | null;
};
export type Promotion = {
  id: string; title: string; description: string; image_path: string | null;
  image_layout: 'reference' | 'image'; bonus_mode: 'percent' | 'fixed'; bonus_percent: number;
  bonus_amount: number; min_amount: number; max_amount: number;
  active: boolean; show_banner: boolean; selectable: boolean; sort_order: number;
};
export type ContactChannel = 'whatsapp' | 'telegram' | 'instagram';
const emptyAnimations: Record<ContactChannel, string | null> = { whatsapp: null, telegram: null, instagram: null };
const defaults: AppContent = {
  ...defaultHomeBanner,
  id: true, logo_path: null, login_image_path: 'brand/panda-login-transparent.png',
  login_image_layout: 'image', whatsapp_url: null, telegram_url: null,
  instagram_url: null, help_url: null, show_whatsapp: true, show_telegram: true, show_instagram: true, allow_player_logout: false, home_bonus_media_path: null,
};
const loadBonusPromotionId = '00000000-0000-4000-8000-000000000777';
const welcome: Promotion = {
  id: loadBonusPromotionId, title: 'Bonos por carga',
  description: 'Desde $5.000 recibís $1.000 y desde $10.000 recibís $2.000.',
  image_path: null, image_layout: 'image',
  bonus_mode: 'percent', bonus_percent: 0, bonus_amount: 0, min_amount: 0, max_amount: 0,
  active: true, show_banner: true, selectable: false, sort_order: 0,
};
const promotionColumns = 'id,title,description,image_path,image_layout,bonus_percent,bonus_mode,bonus_amount,min_amount,max_amount,active,show_banner,selectable,sort_order';
const legacyPromotionColumns = 'id,title,description,image_path,image_layout,bonus_percent,active,show_banner,selectable,sort_order';
function toPromotion(row: {
  id: string; title: string; description?: string | null; image_path?: string | null; image_layout?: string | null;
  bonus_mode?: string | null; bonus_percent?: number | null; bonus_amount?: number | null; min_amount?: number | null; max_amount?: number | null;
  active?: boolean | null; show_banner?: boolean | null; selectable?: boolean | null; sort_order?: number | null;
}): Promotion {
  return {
    id: row.id, title: row.title, description: row.description ?? '', image_path: row.image_path ?? null,
    image_layout: row.image_layout === 'reference' ? 'reference' : 'image', ...asBonusRule(row),
    active: !!row.active, show_banner: !!row.show_banner, selectable: !!row.selectable, sort_order: row.sort_order ?? 0,
  };
}
const ContentContext = createContext({ settings: defaults, promotions: [welcome], contactAnimations: emptyAnimations, reloadPromotions: () => {} });
export const useContent = () => useContext(ContentContext);
export function ContentProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(defaults);
  const [promotions, setPromotions] = useState<Promotion[]>([welcome]);
  const [contactAnimations, setContactAnimations] = useState(emptyAnimations);
  const reloadRef = useRef<() => void>(() => {});
  const reloadPromotions = useCallback(() => { reloadRef.current(); }, []);
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
        // Upgrade the initial screenshot reference without requiring a SQL change.
        setSettings(saved.login_image_path === 'brand/login-reference.png'
          ? { ...saved, login_image_path: defaults.login_image_path, login_image_layout: 'image' }
          : saved);
      }
      if (promos.error && /bonus_mode|bonus_amount|min_amount|max_amount/i.test(promos.error.message ?? '')) {
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
  return <ContentContext.Provider value={{ settings, promotions, contactAnimations, reloadPromotions }}>{children}</ContentContext.Provider>;
}

// Local fallbacks keep the core character assets available before Storage responds.
const previewFiles: Record<string, string> = {
  'brand/panda-login-transparent.png': pandaLogin,
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
  if (settings.home_bonus_media_path) {
    const path = settings.home_bonus_media_path;
    const video = /\.(mp4|webm)$/i.test(path);
    return <section className="bonus-banner image-banner custom-bonus-media" aria-label={promotion.title}>
      {video ? <video key={path} className="bonus-image" src={supabase?.storage.from('app-assets').getPublicUrl(path).data.publicUrl} poster="/preview-assets/load-bonus-banner-v2.webp" autoPlay muted loop playsInline preload="metadata" aria-label={promotion.title} /> : <StorageImage key={path} path={path} alt={promotion.title} className="bonus-image" />}
    </section>;
  }
  if (promotion.image_path) return <section className="bonus-banner image-banner has-copy" aria-label={promotion.title}>
    <StorageImage key={promotion.image_path} path={promotion.image_path} alt={promotion.title} className="bonus-image" />
    <div className="bonus-image-copy"><strong>{promotion.title}</strong>{promotion.description && <p>{promotion.description}</p>}</div>
  </section>;
  if (promotion.id === loadBonusPromotionId) return <section className="bonus-banner image-banner has-copy default-bonus-banner" aria-label={promotion.title}>
    <img className="bonus-image" src="/preview-assets/load-bonus-banner-v2.webp" alt={promotion.title} draggable={false} decoding="async" />
    <div className="bonus-offer-copy">
      <span>Cargá y sumá más</span><strong>Bonos por carga</strong>
      <div className="bonus-offer-tiers"><p>Desde <b>$5.000</b><small>Recibís +$1.000</small></p><p>Desde <b>$10.000</b><small>Recibís +$2.000</small></p></div>
    </div>
  </section>;
  return <section className={`bonus-banner ${promotion.image_layout === 'reference' ? 'reference-banner' : ''}`} aria-label={promotion.title}>
    <div className="bonus-copy"><strong>{promotion.title}</strong><p>{promotion.description}</p></div>
  </section>;
}
