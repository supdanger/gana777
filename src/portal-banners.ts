import { defaultBonusBannerLayout, normalizeBonusBannerLayout } from './bonus-banner-layout.ts';
import type { HomeBannerLayout, HomeBannerTheme } from './home-banner.ts';
import { isBuiltInTheme, isCustomTheme, type PortalTheme } from './portal-theme-design.ts';

export const portalBannerPlaces = ['home', 'withdrawal'] as const;
export type PortalBannerPlace = typeof portalBannerPlaces[number];
export type PortalBanner = {
  id: string;
  theme: PortalTheme;
  place: PortalBannerPlace;
  path: string;
  layout: HomeBannerLayout;
};
export const maxPortalBannersPerPlace = 6;
const pathPattern = /^portal-banners\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$/;
const idPattern = /^[0-9a-f-]{36}$/;

export function defaultPortalBannerLayout(theme: HomeBannerTheme, place: PortalBannerPlace): HomeBannerLayout {
  const layout = defaultBonusBannerLayout(theme);
  return place === 'withdrawal' ? { ...layout, height: 36 } : layout;
}

export function normalizePortalBanners(value: unknown): PortalBanner[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  const banners: PortalBanner[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const theme = typeof row.theme === 'string' ? row.theme : '';
    const place = row.place === 'home' || row.place === 'withdrawal' ? row.place : null;
    const path = typeof row.path === 'string' ? row.path : '';
    if (!idPattern.test(id) || seen.has(id) || !(isBuiltInTheme(theme) || isCustomTheme(theme)) || !place || !pathPattern.test(path)) continue;
    const key = `${theme}:${place}`;
    const count = counts.get(key) ?? 0;
    if (count >= maxPortalBannersPerPlace) continue;
    counts.set(key, count + 1);
    seen.add(id);
    const base = isBuiltInTheme(theme) ? theme : 'base';
    banners.push({ id, theme, place, path, layout: normalizeBonusBannerLayout(row.layout, base) });
  }
  return banners;
}

export function portalBannersFor(value: unknown, theme: string, place: PortalBannerPlace): PortalBanner[] {
  return normalizePortalBanners(value).filter(banner => banner.theme === theme && banner.place === place);
}
