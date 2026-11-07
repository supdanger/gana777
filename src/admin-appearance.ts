export const panelThemes = [
  { key: 'violeta', label: 'Violeta' },
  { key: 'grafito', label: 'Grafito' },
  { key: 'esmeralda', label: 'Esmeralda' },
  { key: 'dorado', label: 'Ámbar' },
  { key: 'negro', label: 'Negro' },
] as const;

export type PanelTheme = typeof panelThemes[number]['key'];
export function normalizePanelTheme(value: string | null): PanelTheme {
  if (value === 'azul') return 'grafito';
  return panelThemes.some(theme => theme.key === value) ? value as PanelTheme : 'violeta';
}
