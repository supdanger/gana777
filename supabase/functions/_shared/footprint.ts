const footprintKeys = ['canvas', 'renderer', 'screen', 'cores', 'touch', 'platform'] as const;

// La huella usa señales del teléfono que no se borran con los datos del navegador.
// No incluye la red: dos personas en la misma WiFi siguen pudiendo pedir su cuenta.
export function canonicalFootprint(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of footprintKeys) {
    const item = raw[key];
    if (typeof item !== 'string') return null;
    const trimmed = item.trim();
    if (key === 'canvas') {
      if (!/^[a-f0-9]{64}$/.test(trimmed)) return null;
    } else if (!/^[\x20-\x7e]{1,160}$/.test(trimmed)) return null;
    parts.push(`${key}=${trimmed}`);
  }
  return parts.join('\n');
}
