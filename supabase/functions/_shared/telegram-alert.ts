export type TelegramAlert = {
  id: string;
  route: string;
  event_type: 'deposit' | 'withdrawal' | 'shift_start' | 'shift_end';
  payload: Record<string, unknown>;
  attempts: number;
};

const amount = (value: unknown) => `$${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
const label = (value: unknown) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60);

export function telegramAlertText(alert: TelegramAlert): string {
  const data = alert.payload;
  if (alert.event_type === 'shift_start' || alert.event_type === 'shift_end') {
    const action = alert.event_type === 'shift_start' ? 'inició' : 'finalizó';
    const phones = Array.isArray(data.phones) ? data.phones.filter(Number.isInteger).join(', ') : '';
    return `🕒 ${label(data.operator_name)} ${action} turno · SAC ${data.sac}${phones ? ` · Teléfonos ${phones}` : ''}`;
  }
  const kind = alert.event_type === 'withdrawal' ? '💸 Retiro pendiente' : '📥 Carga pendiente';
  const station = alert.event_type === 'deposit' && Number.isInteger(data.sac) ? ` · SAC ${data.sac}` : '';
  const phone = alert.event_type === 'deposit' && Number.isInteger(data.phone) ? ` · Teléfono ${data.phone}` : '';
  return `${kind}${station}${phone}\n${label(data.user_name)} · ${amount(data.amount)}\nRef. ${label(data.request_id).slice(0, 8)}`;
}
