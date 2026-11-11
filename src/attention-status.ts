export function attentionWait(value: string, now = Date.now()): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Por responder';
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return 'Espera < 1 min';
  if (minutes < 60) return `Espera ${minutes} min`;
  if (minutes < 1440) return `Espera ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `Espera ${Math.floor(minutes / 1440)} d`;
}
