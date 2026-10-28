import { defaultHomeBannerLayout, normalizeHomeBannerLayout, type HomeBannerLayout, type HomeBannerTheme } from './home-banner.ts';

export type BonusBannerLayout = HomeBannerLayout & { buttonX: number; buttonY: number; buttonScale: number; infoX: number; infoY: number; infoScale: number };

const defaultHeights: Record<string, number> = {
  base: 43, dark: 49, christmas: 50, 'new-year': 43, halloween: 60,
};

export function defaultBonusBannerLayout(theme: HomeBannerTheme): BonusBannerLayout {
  return { ...defaultHomeBannerLayout, height: defaultHeights[theme] ?? 43, radius: 12, buttonX: 0, buttonY: 0, buttonScale: 100, infoX: 43, infoY: -37, infoScale: 100 };
}

export function normalizeBonusBannerLayout(value: unknown, theme: HomeBannerTheme): BonusBannerLayout {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const defaults = defaultBonusBannerLayout(theme);
  const safe = normalizeHomeBannerLayout({ ...source, height: defaultHomeBannerLayout.height }, {
    ...defaultHomeBannerLayout, height: defaults.height, radius: defaults.radius,
  });
  const height = source.height;
  const number = (key: 'buttonX' | 'buttonY' | 'buttonScale' | 'infoX' | 'infoY' | 'infoScale', fallback: number, min: number, max: number) => typeof source[key] === 'number' && Number.isFinite(source[key])
    ? Math.round(Math.min(max, Math.max(min, source[key] as number)) * 10) / 10 : fallback;
  return { ...safe, height: typeof height === 'number' && Number.isFinite(height)
    ? Math.round(Math.min(80, Math.max(25, height)) * 10) / 10 : defaultHeights[theme] ?? 43,
    buttonX: number('buttonX', 0, -45, 45), buttonY: number('buttonY', 0, -30, 30), buttonScale: number('buttonScale', 100, 70, 150),
    infoX: number('infoX', 43, -45, 45), infoY: number('infoY', -37, -45, 45), infoScale: number('infoScale', 100, 60, 160) };
}

export function bonusButtonLayoutStyles(layout: BonusBannerLayout) {
  return { '--player-bonus-button-x': `${layout.buttonX}%`, '--player-bonus-button-y': `${layout.buttonY}%`, '--player-bonus-button-scale': String(layout.buttonScale / 100), '--player-bonus-info-x': `${layout.infoX}%`, '--player-bonus-info-y': `${layout.infoY}%`, '--player-bonus-info-scale': String(layout.infoScale / 100) };
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
