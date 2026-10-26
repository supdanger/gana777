export type TelegramAlert = {
  id: string;
  route: string;
  event_type: 'deposit' | 'withdrawal' | 'shift_start' | 'shift_end';
  payload: Record<string, unknown>;
  attempts: number;
};

export type TelegramNotice = {
  bonus?: number | null;
  receiptUnavailable?: boolean;
};

const amount = (value: unknown) => `$${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
const label = (value: unknown) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60);
const field = (name: string, value: string) => `${name}\n${value}`;

export function bonusPesos(operationAmount: number, bonusPercent: number, bonusAmount: number): number {
  const amountCents = Math.round((Number(operationAmount) || 0) * 100);
  const bonusCents = bonusPercent > 0
    ? Math.round(amountCents * bonusPercent / 100)
    : Math.round(Math.max(0, Number(bonusAmount) || 0) * 100);
  return bonusCents / 100;
}

export function receiptMedia(format: string): { mime: string; field: 'photo' | 'document'; filename: string } | null {
  const normalized = format.toLowerCase() === 'jpeg' ? 'jpg' : format.toLowerCase();
  if (normalized === 'jpg') return { mime: 'image/jpeg', field: 'photo', filename: 'comprobante.jpg' };
  if (normalized === 'png') return { mime: 'image/png', field: 'photo', filename: 'comprobante.png' };
  if (normalized === 'webp') return { mime: 'image/webp', field: 'photo', filename: 'comprobante.webp' };
  if (normalized === 'pdf') return { mime: 'application/pdf', field: 'document', filename: 'comprobante.pdf' };
  return null;
}

export function telegramAlertText(alert: TelegramAlert, notice: TelegramNotice = {}): string {
  const data = alert.payload;
  if (alert.event_type === 'shift_start' || alert.event_type === 'shift_end') {
    const action = alert.event_type === 'shift_start' ? 'inició' : 'finalizó';
    const phones = Array.isArray(data.phones) ? data.phones.filter(phone => Number.isInteger(phone)).join(', ') : '';
    const lines = [`${label(data.operator_name)} ${action} turno`, '', field('SAC', String(data.sac))];
    if (phones) lines.push('', field('Teléfonos', phones));
    return lines.join('\n');
  }
  if (alert.event_type === 'withdrawal') {
    return ['Retiro pendiente', '', field('Usuario', label(data.user_name)), '', field('Monto', amount(data.amount))].join('\n');
  }
  const lines = ['Carga pendiente', ''];
  if (Number.isInteger(data.sac)) lines.push(field('SAC', String(data.sac)), '');
  if (Number.isInteger(data.phone)) lines.push(field('Teléfono', String(data.phone)), '');
  const bonus = Number(notice.bonus) || 0;
  lines.push(
    field('Usuario', label(data.user_name)),
    '',
    field('Monto', amount(data.amount)),
    '',
    field('Bono', bonus > 0 ? `+${amount(bonus)}` : 'Sin bono'),
  );
  if (notice.receiptUnavailable) lines.push('', 'Comprobante no disponible');
  return lines.join('\n');
}
