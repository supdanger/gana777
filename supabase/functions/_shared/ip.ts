export function requestIp(headers: Headers): string | null {
  const raw = headers.get('cf-connecting-ip') || headers.get('x-real-ip') || headers.get('x-forwarded-for')?.split(',')[0];
  const value = raw?.trim().toLowerCase();
  if (!value || value.length > 80) return null;
  if (/^[0-9]+(?:\.[0-9]+){3}$/.test(value)) {
    const parts = value.split('.').map(Number);
    return parts.every(part => part >= 0 && part <= 255) ? parts.join('.') : null;
  }
  if (value.includes(':')) {
    try { return new URL(`http://[${value}]/`).hostname.slice(1, -1); }
    catch { return null; }
  }
  return null;
}
