import type { CSSProperties } from 'react';

export const builtInThemes = ['base', 'dark', 'christmas', 'new-year', 'halloween'] as const;
export type BuiltInTheme = typeof builtInThemes[number];
export type PortalTheme = BuiltInTheme | `custom-${string}`;
export const isBuiltInTheme = (value: string): value is BuiltInTheme => builtInThemes.some(theme => theme === value);
export const isCustomTheme = (value: string): value is `custom-${string}` => /^custom-[0-9a-f-]{36}$/.test(value);

export const cardSlots = [
  { id: 'notifications', label: 'Avisos' },
  { id: 'profile', label: 'Perfil' },
  { id: 'bonus', label: 'Banner de bonos' },
  { id: 'casino', label: 'Ir al casino' },
  { id: 'deposit', label: 'Cargar' },
  { id: 'withdrawal', label: 'Retiros' },
  { id: 'bonuses', label: 'Bonos' },
  { id: 'tutorial', label: 'Tutorial' },
  { id: 'wheel', label: 'Ruleta' },
  { id: 'chat', label: 'Chat' },
  { id: 'general', label: 'Otras tarjetas' },
  { id: 'install', label: 'Instalar' },
] as const;
export type CardSlot = typeof cardSlots[number]['id'];
export const imageCardSlots = ['deposit', 'withdrawal', 'bonuses', 'tutorial', 'wheel'] as const;
export type ImageCardSlot = typeof imageCardSlots[number];
export const isImageCardSlot = (slot: CardSlot): slot is ImageCardSlot => (imageCardSlots as readonly string[]).includes(slot);
export type CardStyle = { background: string; borderColor: string; borderWidth: number; radius: number };
export type ThemeCardImageLayout = { width: number; height: number; x: number; y: number };
export const defaultThemeCardImageLayout: ThemeCardImageLayout = { width: 100, height: 100, x: 0, y: 0 };
export function normalizeThemeCardImageLayout(value: unknown): ThemeCardImageLayout {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const clamp = (candidate: unknown, fallback: number, min: number, max: number) => typeof candidate === 'number' && Number.isFinite(candidate) ? Math.round(Math.min(max, Math.max(min, candidate)) * 10) / 10 : fallback;
  return {
    width: clamp(source.width, 100, 50, 300),
    height: clamp(source.height, 100, 50, 300),
    x: clamp(source.x, 0, -100, 100),
    y: clamp(source.y, 0, -100, 100),
  };
}
export type ThemeDesign = {
  name?: string;
  baseTheme?: BuiltInTheme;
  backgroundPath?: string | null;
  backgroundX?: number;
  backgroundY?: number;
  backgroundScale?: number;
  bonusPath?: string | null;
  casinoPath?: string | null;
  depositPath?: string | null;
  withdrawalPath?: string | null;
  bonusesPath?: string | null;
  tutorialPath?: string | null;
  wheelPath?: string | null;
  depositImageLayout?: ThemeCardImageLayout;
  withdrawalImageLayout?: ThemeCardImageLayout;
  bonusesImageLayout?: ThemeCardImageLayout;
  tutorialImageLayout?: ThemeCardImageLayout;
  wheelImageLayout?: ThemeCardImageLayout;
  logoPath?: string | null;
  cards?: Partial<Record<CardSlot, CardStyle>>;
};
export type ThemeDesigns = Record<string, ThemeDesign>;
export type ThemeSettings = { portal_theme: PortalTheme; portal_theme_designs: ThemeDesigns };

const palettes: Record<BuiltInTheme, { background: string; borderColor: string }> = {
  base: { background: '#14283a', borderColor: '#304a60' },
  dark: { background: '#10161d', borderColor: '#344150' },
  christmas: { background: '#080605', borderColor: '#d1181d' },
  'new-year': { background: '#171b35', borderColor: '#626281' },
  halloween: { background: '#09080c', borderColor: '#8b2ca8' },
};

export function themeBase(settings: ThemeSettings, theme = settings.portal_theme): BuiltInTheme {
  if (isBuiltInTheme(theme)) return theme;
  const base = settings.portal_theme_designs?.[theme]?.baseTheme;
  return base && isBuiltInTheme(base) ? base : 'base';
}

export function defaultCardStyle(settings: ThemeSettings, theme = settings.portal_theme): CardStyle {
  const palette = palettes[themeBase(settings, theme)];
  return { ...palette, borderWidth: 1, radius: 12 };
}

export function normalizeCardStyle(value: unknown, fallback: CardStyle): CardStyle {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const color = (value: unknown, fallbackColor: string) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallbackColor;
  const number = (value: unknown, fallbackNumber: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallbackNumber;
  return {
    background: color(input.background, fallback.background),
    borderColor: color(input.borderColor, fallback.borderColor),
    borderWidth: number(input.borderWidth, fallback.borderWidth, 0, 8),
    radius: number(input.radius, fallback.radius, 0, 40),
  };
}

export function themeSurface(settings: ThemeSettings, publicUrl: (path: string) => string | null): { className: string; style: CSSProperties } {
  const theme = settings.portal_theme;
  const design = settings.portal_theme_designs?.[theme];
  const base = themeBase(settings);
  const classes = [`theme-${theme}`];
  if (base !== theme) classes.push(`theme-${base}`);
  const style: Record<string, string | number> = {};
  if (design?.backgroundPath) {
    const url = publicUrl(design.backgroundPath);
    if (url) {
      style.backgroundImage = `url("${url.replaceAll('"', '%22')}")`;
      style.backgroundRepeat = 'no-repeat';
    }
  }
  if (design && (design.backgroundPath || design.backgroundX !== undefined || design.backgroundY !== undefined || design.backgroundScale !== undefined)) {
    style.backgroundPosition = `${Math.min(100, Math.max(0, design.backgroundX ?? 50))}% ${Math.min(100, Math.max(0, design.backgroundY ?? 0))}%`;
    style.backgroundSize = (design.backgroundScale ?? 100) === 100 ? 'cover' : `${Math.min(200, Math.max(50, design.backgroundScale ?? 100))}% auto`;
  }
  if (design?.cards) for (const { id } of cardSlots) {
    const selected = design.cards[id];
    if (!selected) continue;
    const card = normalizeCardStyle(selected, defaultCardStyle(settings));
    classes.push(`theme-card-${id}-custom`);
    style[`--theme-${id}-background`] = card.background;
    style[`--theme-${id}-border`] = card.borderColor;
    style[`--theme-${id}-border-width`] = `${card.borderWidth}px`;
    style[`--theme-${id}-radius`] = `${card.radius}px`;
  }
  for (const id of imageCardSlots) {
    const path = design?.[`${id}Path`];
    const url = path ? publicUrl(path) : null;
    if (!url) continue;
    classes.push(`theme-card-${id}-image`);
    const layout = normalizeThemeCardImageLayout(design?.[`${id}ImageLayout`]);
    style[`--theme-${id}-image-width`] = `${layout.width}%`;
    style[`--theme-${id}-image-height`] = `${layout.height}%`;
    style[`--theme-${id}-image-x`] = `${layout.x}%`;
    style[`--theme-${id}-image-y`] = `${layout.y}%`;
  }
  return { className: classes.join(' '), style: style as CSSProperties };
}
