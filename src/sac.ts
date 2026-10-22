import { InputError } from '../supabase/functions/_shared/validation.ts';
import { formatPhoneList, sacShiftMessage } from '../supabase/functions/_shared/sac-message.ts';

export { formatPhoneList, sacShiftMessage };
export const SAC_COUNT = 5;
export const SAC_PHONE_MAX = 30;
export const SAC_STATION_KEY = 'gana777-sac-station';
const operatorNamePattern = /^[\p{L}\p{M}][\p{L}\p{M}\p{N} .'-]*$/u;
const operatorControl = /[\u0000-\u001F\u007F]/;

export type SacStation = { number: number; operator_name: string | null; started_at: string | null; phones: number[] };
export type SacPhoneOption = { phone: number; holders: string[]; active_count: number };
export type SacBoardData = { active_shift: string | null; stations: SacStation[]; phones: SacPhoneOption[] };
export type DepositScope = number | 'all' | 'none';

export function parseSacStation(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return Number.isInteger(number) && number >= 1 && number <= SAC_COUNT ? number : null;
}

export function parseOperatorName(raw: unknown): string {
  if (typeof raw !== 'string') throw new InputError('Escribí el nombre de quien inicia el turno.');
  const name = raw.normalize('NFC').trim().replace(/ {2,}/g, ' ');
  if (name.length < 1 || name.length > 40 || operatorControl.test(name) || !operatorNamePattern.test(name)) {
    throw new InputError('Escribí el nombre de quien inicia el turno.');
  }
  return name;
}

export function parsePhoneNumber(raw: unknown): number {
  if (typeof raw !== 'string' || !/^\d{1,2}$/.test(raw.trim())) throw new InputError('Elegí el número de teléfono, del 1 al 30.');
  const phone = Number(raw.trim());
  if (!Number.isInteger(phone) || phone < 1 || phone > SAC_PHONE_MAX) throw new InputError('Elegí el número de teléfono, del 1 al 30.');
  return phone;
}

export function scopedDepositFilter(superAdmin: boolean, station: number | null): DepositScope {
  if (superAdmin) return 'all';
  return station ?? 'none';
}

export function depositRouteLabel(row: { kind: string; deposit_phone?: number | null; deposit_holder?: string | null; deposit_sac?: number | null }, superAdmin: boolean): string {
  if (row.kind !== 'deposit') return '';
  if (!('deposit_sac' in row) && !('deposit_phone' in row) && !('deposit_holder' in row)) return '';
  const parts = [
    superAdmin ? (row.deposit_sac ? `SAC ${row.deposit_sac}` : 'Sin SAC') : '',
    row.deposit_phone ? `Teléfono ${row.deposit_phone}` : '',
    row.deposit_holder ?? '',
  ].filter(Boolean);
  return parts.join(' · ');
}

export function telegramShiftSentence(verb: 'iniciado' | 'finalizado', result: { delivered?: boolean; reason?: string } | null, invokeFailed: boolean): string {
  const lead = `Turno ${verb}.`;
  if (invokeFailed) return `${lead} El aviso queda preparado: desplegá notify-sac-shift y cargá las variables de Telegram.`;
  if (result?.delivered) return `${lead} El aviso salió por Telegram.`;
  if (result?.reason === 'missing_config') return `${lead} Telegram queda listo para cuando cargues TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.`;
  return `${lead} No pudimos enviar el aviso de Telegram.`;
}

export type PhoneGroup<T> = { phone: number | null; items: T[] };

export function groupAccountsByPhone<T extends { phone_number: number | null }>(accounts: readonly T[]): PhoneGroup<T>[] {
  const grouped = new Map<number | null, T[]>();
  for (const account of accounts) {
    const phone = account.phone_number;
    const items = grouped.get(phone);
    if (items) items.push(account);
    else grouped.set(phone, [account]);
  }
  const phones = [...grouped.keys()].filter((phone): phone is number => phone !== null).sort((left, right) => left - right);
  const groups: PhoneGroup<T>[] = [];
  const unassigned = grouped.get(null);
  if (unassigned) groups.push({ phone: null, items: unassigned });
  for (const phone of phones) {
    const items = grouped.get(phone);
    if (items) groups.push({ phone, items });
  }
  return groups;
}

function readPhone(value: unknown): number | null {
  const phone = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return Number.isInteger(phone) && phone >= 1 && phone <= SAC_PHONE_MAX ? phone : null;
}

export function readSacBoard(data: unknown): SacBoardData {
  const row = data && typeof data === 'object' ? data as { active_shift?: unknown; stations?: unknown; phones?: unknown } : {};
  const stations = Array.isArray(row.stations) ? row.stations.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const station = item as { number?: unknown; operator_name?: unknown; started_at?: unknown; phones?: unknown };
    const number = parseSacStation(station.number);
    if (!number) return [];
    const phones = Array.isArray(station.phones) ? station.phones.flatMap(phone => {
      const parsed = readPhone(phone);
      return parsed === null ? [] : [parsed];
    }) : [];
    return [{
      number,
      operator_name: typeof station.operator_name === 'string' && station.operator_name ? station.operator_name : null,
      started_at: typeof station.started_at === 'string' ? station.started_at : null,
      phones,
    }];
  }) : [];
  const phones = Array.isArray(row.phones) ? row.phones.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const phone = item as { phone?: unknown; holders?: unknown; active_count?: unknown };
    const number = readPhone(phone.phone);
    if (!number) return [];
    const holders = Array.isArray(phone.holders) ? phone.holders.filter((holder): holder is string => typeof holder === 'string' && holder.length > 0) : [];
    return [{ phone: number, holders, active_count: Math.max(0, Number(phone.active_count) || 0) }];
  }) : [];
  return {
    active_shift: typeof row.active_shift === 'string' ? row.active_shift : null,
    stations,
    phones,
  };
}

export function stationsOrDefaults(stations: readonly SacStation[]): SacStation[] {
  return Array.from({ length: SAC_COUNT }, (_, index) => {
    const number = index + 1;
    return stations.find(station => station.number === number) ?? { number, operator_name: null, started_at: null, phones: [] };
  });
}

export const demoSacPhones: SacPhoneOption[] = [
  { phone: 1, holders: ['Muñoz', 'Pérez'], active_count: 2 },
  { phone: 2, holders: ['Bazan'], active_count: 1 },
  { phone: 3, holders: ['Gómez'], active_count: 1 },
  { phone: 4, holders: ['Romero', 'Sosa'], active_count: 2 },
  { phone: 5, holders: ['Acosta'], active_count: 1 },
];
