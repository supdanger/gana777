export function formatPhoneList(phones: readonly number[]): string {
  const unique = [...new Set(phones.filter(phone => Number.isInteger(phone) && phone > 0))].sort((left, right) => left - right);
  if (unique.length < 2) return unique.length === 1 ? String(unique[0]) : '';
  return `${unique.slice(0, -1).join(', ')} y ${unique[unique.length - 1]}`;
}

export function sacShiftMessage(action: 'start' | 'end', name: string, sac: number, phones: readonly number[] = []): string {
  const base = `${name} ${action === 'start' ? 'inició' : 'finalizó'} turno · SAC ${sac} · Gana777`;
  if (action === 'start') return base;
  const list = formatPhoneList(phones);
  return list ? `${base} · Teléfonos ${list}` : `${base} · Sin teléfonos`;
}
