import { defaultHomeBannerLayout, normalizeHomeBannerLayout, type HomeBannerLayout, type HomeBannerTheme } from './home-banner.ts';

const defaultHeights: Record<string, number> = {
  base: 43, dark: 49, christmas: 50, 'new-year': 43, halloween: 60,
};

export function defaultBonusBannerLayout(theme: HomeBannerTheme): HomeBannerLayout {
  return { ...defaultHomeBannerLayout, height: defaultHeights[theme] ?? 43, radius: 12 };
}

export function normalizeBonusBannerLayout(value: unknown, theme: HomeBannerTheme): HomeBannerLayout {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const safe = normalizeHomeBannerLayout({ ...source, height: defaultHomeBannerLayout.height }, defaultBonusBannerLayout(theme));
  const height = source.height;
  return { ...safe, height: typeof height === 'number' && Number.isFinite(height)
    ? Math.round(Math.min(80, Math.max(25, height)) * 10) / 10 : defaultHeights[theme] ?? 43 };
}

export function bonusBannerLayout(settings: { home_bonus_layouts: Record<string, unknown>; portal_theme_designs?: Record<string, { baseTheme?: HomeBannerTheme }> }, theme: HomeBannerTheme): HomeBannerLayout {
  const base = settings.portal_theme_designs?.[theme]?.baseTheme ?? theme;
  return normalizeBonusBannerLayout(settings.home_bonus_layouts?.[theme], base);
}

// Los banners especiales llevan el texto sobre la imagen. Si la imagen se hizo
// más baja desde el editor, reducir también la tarjeta evita bandas vacías.
export function specialBonusDisplayLayout(layout: HomeBannerLayout): HomeBannerLayout {
  if (layout.imageHeight >= 100) return layout;
  return {
    ...layout,
    height: layout.height * layout.imageHeight / 100,
    imageHeight: 100,
    y: layout.y * 100 / layout.imageHeight,
  };
}
