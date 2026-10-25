import { InputError } from '../supabase/functions/_shared/validation.ts';
import { safeHttpsLink } from './security.ts';
import type { PortalTheme, ThemeDesigns } from './portal-theme-design.ts';

export type HomeBannerSettings = {
  home_banner_enabled: boolean;
  home_banner_title: string;
  home_banner_url: string | null;
  home_banner_path: string | null;
  home_banner_dark_path: string | null;
  home_banner_christmas_path: string | null;
  home_banner_new_year_path: string | null;
  home_banner_halloween_path: string | null;
  home_banner_layouts: Record<string, unknown>;
};
export const defaultHomeBanner: HomeBannerSettings = {
  home_banner_enabled: false, home_banner_title: 'Visitar página', home_banner_url: null, home_banner_path: null,
  home_banner_dark_path: null, home_banner_christmas_path: null, home_banner_new_year_path: null, home_banner_halloween_path: null,
  home_banner_layouts: {},
};
export const homeBannerColumns = 'home_banner_enabled,home_banner_title,home_banner_url,home_banner_path,home_banner_dark_path,home_banner_christmas_path,home_banner_new_year_path,home_banner_halloween_path,home_banner_layouts,portal_theme_designs,allow_player_logout';

export type HomeBannerTheme = PortalTheme;
export type HomeBannerLayout = { height: number; width: number; imageHeight: number; x: number; y: number; radius: number };
export const defaultHomeBannerLayout: HomeBannerLayout = { height: 16.8, width: 100, imageHeight: 100, x: 0, y: 0, radius: 7 };
export function defaultHomeBannerLayoutForTheme(theme: HomeBannerTheme): HomeBannerLayout {
  return { ...defaultHomeBannerLayout, height: theme === 'halloween' ? 18 : defaultHomeBannerLayout.height, radius: theme === 'christmas' || theme === 'halloween' ? 10 : 7 };
}
const bannerLayoutLimits: Record<keyof HomeBannerLayout, [number, number]> = {
  height: [10, 35], width: [50, 300], imageHeight: [50, 300], x: [-100, 100], y: [-100, 100], radius: [0, 40],
};
export function normalizeHomeBannerLayout(value: unknown, defaults = defaultHomeBannerLayout): HomeBannerLayout {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result = { ...defaults };
  for (const key of Object.keys(result) as (keyof HomeBannerLayout)[]) {
    const number = source[key];
    if (typeof number === 'number' && Number.isFinite(number)) {
      const [min, max] = bannerLayoutLimits[key];
      result[key] = Math.round(Math.min(max, Math.max(min, number)) * 10) / 10;
    }
  }
  return result;
}
export function homeBannerLayout(settings: HomeBannerSettings, theme: HomeBannerTheme): HomeBannerLayout {
  const base = (settings as HomeBannerSettings & { portal_theme_designs?: ThemeDesigns }).portal_theme_designs?.[theme]?.baseTheme ?? theme;
  return normalizeHomeBannerLayout(settings.home_banner_layouts?.[theme], defaultHomeBannerLayoutForTheme(base));
}
export function homeBannerLayoutStyles(layout: HomeBannerLayout) {
  return {
    '--home-banner-ratio': `100 / ${layout.height}`,
    '--home-banner-image-width': `${layout.width}%`,
    '--home-banner-image-height': `${layout.imageHeight}%`,
    '--home-banner-image-x': `${layout.x}%`,
    '--home-banner-image-y': `${layout.y}%`,
    '--home-banner-radius': `${layout.radius}px`,
  };
}
export function homeBannerImage(settings: HomeBannerSettings & { portal_theme_designs?: ThemeDesigns }, theme: HomeBannerTheme): string | null {
  const design = settings.portal_theme_designs?.[theme];
  if (design?.casinoPath) return design.casinoPath;
  if (theme === 'christmas') return settings.home_banner_christmas_path ?? '/preview-assets/christmas-casino-banner.webp';
  if (theme === 'halloween') return settings.home_banner_halloween_path ?? '/preview-assets/halloween-casino-banner.webp';
  if (theme === 'dark') return settings.home_banner_dark_path ?? settings.home_banner_path;
  if (theme === 'new-year') return settings.home_banner_new_year_path ?? settings.home_banner_path;
  if (theme.startsWith('custom-')) return homeBannerImage(settings, design?.baseTheme ?? 'base');
  return settings.home_banner_path;
}

export function homeBannerLink(settings: HomeBannerSettings, personalUrl?: string | null): string | null {
  return settings.home_banner_enabled && settings.home_banner_path ? safeHttpsLink(personalUrl) ?? safeHttpsLink(settings.home_banner_url) : null;
}

export function parseHomeBanner(enabled: boolean, title: string, url: string, path: string | null): HomeBannerSettings {
  const label = title.trim();
  if (!label || label.length > 80) throw new InputError('Ingresá un nombre de entre 1 y 80 caracteres para el botón.');
  const link = url.trim() ? safeHttpsLink(url.trim()) : null;
  if (url.trim() && !link) throw new InputError('Ingresá una dirección HTTPS válida, sin usuario ni contraseña.');
  if (enabled && (!link || !path)) throw new InputError('Para mostrar el botón, cargá una imagen y un enlace de destino.');
  return { ...defaultHomeBanner, home_banner_enabled: enabled, home_banner_title: label, home_banner_url: link, home_banner_path: path };
}

export async function bannerImageExtension(file: File): Promise<string> {
  if (!file.size || file.size > 5 * 1024 * 1024) throw new InputError('La imagen debe pesar hasta 5 MB.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === 'image/png' && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return 'png';
  if (file.type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (file.type === 'image/webp' && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'webp';
  throw new InputError('Elegí una imagen JPG, PNG o WebP válida.');
}
