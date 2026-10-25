import type { PortalTheme } from './portal-theme-design.ts';
export type HeaderLogoTheme = PortalTheme;
export type HeaderLogoLayout = { width: number; height: number; scale: number; x: number; y: number };

export const defaultHeaderLogoLayout: HeaderLogoLayout = { width: 140, height: 40, scale: 100, x: 0, y: 0 };
const bounds: Record<keyof HeaderLogoLayout, [number, number]> = {
  width: [60, 320], height: [20, 140], scale: [50, 400], x: [-120, 120], y: [-70, 70],
};

export function normalizeHeaderLogoLayout(value: unknown): HeaderLogoLayout {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result = { ...defaultHeaderLogoLayout };
  for (const key of Object.keys(result) as (keyof HeaderLogoLayout)[]) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      const [min, max] = bounds[key];
      result[key] = Math.round(Math.min(max, Math.max(min, value)));
    }
  }
  return result;
}

export function headerLogoLayout(settings: { portal_header_logo_layouts: Record<string, unknown> }, theme: HeaderLogoTheme): HeaderLogoLayout {
  return normalizeHeaderLogoLayout(settings.portal_header_logo_layouts?.[theme]);
}

export function headerLogoStyle(layout: HeaderLogoLayout) {
  return {
    '--portal-logo-width': `${layout.width}px`,
    '--portal-logo-height': `${layout.height}px`,
    '--portal-logo-scale': layout.scale / 100,
    '--portal-logo-x': `${layout.x}px`,
    '--portal-logo-y': `${layout.y}px`,
  };
}
