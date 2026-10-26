import { InputError } from '../supabase/functions/_shared/validation.ts';
import { formatPhoneList, sacShiftMessage } from '../supabase/functions/_shared/sac-message.ts';
import { shiftLabel, type ShiftKey } from './shifts.ts';

export { formatPhoneList, sacShiftMessage };
export const SAC_COUNT = 5;
export const SAC_PHONE_MAX = 30;
export const SAC_STATION_KEY = 'gana777-sac-station';
const operatorNamePattern = /^[\p{L}\p{M}][\p{L}\p{M}\p{N} .'-]*$/u;
const operatorControl = /[\u0000-\u001F\u007F]/;

export type SacStation = { number: number; operator_name: string | null; started_at: string | null; phones: number[] };
export type SacPhoneAccount = {
  id: string;
  bank: string;
  holder: string;
  alias: string;
  cbu: string;
  theme_key: string | null;
  theme_background_path: string | null;
  theme_logo_path: string | null;
  active: boolean;
  shift_key: string | null;
};
export type SacPhoneOption = { phone: number; holders: string[]; active_count: number; on_shift?: boolean; accounts?: SacPhoneAccount[] };
export type AccountPhoneSource = {
  id?: unknown;
  phone_number?: unknown;
  bank?: unknown;
  holder?: unknown;
  alias?: unknown;
  cbu?: unknown;
  theme_key?: unknown;
  theme_background_path?: unknown;
  theme_logo_path?: unknown;
  active?: unknown;
  shift_key?: unknown;
};
export type SacAccountBadge = { label: string; tone: 'ready' | 'paused' | 'other' };
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

function sortedHolders(holders: ReadonlySet<string>): string[] {
  return [...holders].sort((left, right) => left.localeCompare(right, 'es'));
}

function textOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readCard(account: AccountPhoneSource, fallbackId: string): SacPhoneAccount | null {
  const bank = textOrEmpty(account.bank);
  const holder = textOrEmpty(account.holder);
  if (!bank || !holder) return null;
  const id = textOrEmpty(account.id) || fallbackId;
  return {
    id,
    bank,
    holder,
    alias: textOrEmpty(account.alias),
    cbu: textOrEmpty(account.cbu),
    theme_key: textOrEmpty(account.theme_key) || null,
    theme_background_path: textOrEmpty(account.theme_background_path) || null,
    theme_logo_path: textOrEmpty(account.theme_logo_path) || null,
    active: account.active === true,
    shift_key: textOrEmpty(account.shift_key) || null,
  };
}

export function sacAccountBadge(account: { active: boolean; shift_key: string | null }, activeShift: string | null): SacAccountBadge {
  if (!account.active) return { label: 'Pausada', tone: 'paused' };
  if (activeShift && account.shift_key && account.shift_key !== activeShift) {
    const label = account.shift_key in shiftLabel ? shiftLabel[account.shift_key as ShiftKey] : 'Otro turno';
    return { label, tone: 'other' };
  }
  return { label: 'Recibe cargas', tone: 'ready' };
}

export function phonesFromAccounts(accounts: readonly AccountPhoneSource[], activeShift: string | null): SacPhoneOption[] {
  const buckets = new Map<number, { shiftHolders: Set<string>; anyHolders: Set<string>; activeOnShift: number; onShift: boolean; accounts: SacPhoneAccount[] }>();
  for (const account of accounts) {
    const phone = readPhone(account.phone_number);
    if (phone === null) continue;
    const bucket = buckets.get(phone) ?? { shiftHolders: new Set<string>(), anyHolders: new Set<string>(), activeOnShift: 0, onShift: false, accounts: [] };
    const holder = textOrEmpty(account.holder);
    if (holder) bucket.anyHolders.add(holder);
    const card = readCard(account, `${phone}-${bucket.accounts.length + 1}`);
    if (card) bucket.accounts.push(card);
    const matchesShift = activeShift === null || account.shift_key === activeShift;
    if (matchesShift) {
      bucket.onShift = true;
      if (holder) bucket.shiftHolders.add(holder);
      if (account.active === true) bucket.activeOnShift += 1;
    }
    buckets.set(phone, bucket);
  }
  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([phone, bucket]) => ({
      phone,
      holders: sortedHolders(bucket.onShift && bucket.shiftHolders.size > 0 ? bucket.shiftHolders : bucket.anyHolders),
      active_count: bucket.activeOnShift,
      on_shift: activeShift === null || bucket.onShift,
      accounts: [...bucket.accounts].sort((left, right) => left.holder.localeCompare(right.holder, 'es') || left.bank.localeCompare(right.bank, 'es')),
    }));
}

export function phonesForShift(phones: readonly SacPhoneOption[], activeShift: string | null): SacPhoneOption[] {
  if (!activeShift) return [];
  return phones.flatMap(phone => {
    const accounts = (phone.accounts ?? []).filter(account => account.shift_key === activeShift);
    if (!accounts.length) return [];
    const holders = [...new Set(accounts.map(account => account.holder).filter(holder => holder.length > 0))]
      .sort((left, right) => left.localeCompare(right, 'es'));
    return [{ phone: phone.phone, holders, active_count: accounts.filter(account => account.active).length, on_shift: true, accounts }];
  });
}

export function mergePhoneOptions(fromAccounts: readonly SacPhoneOption[], fromBoard: readonly SacPhoneOption[]): SacPhoneOption[] {
  const merged = new Map<number, SacPhoneOption>();
  for (const phone of fromBoard) merged.set(phone.phone, phone);
  for (const phone of fromAccounts) merged.set(phone.phone, phone);
  return [...merged.values()].sort((left, right) => left.phone - right.phone);
}

export function readSacBoard(data: unknown): SacBoardData {
  let payload = data;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload) as unknown; } catch { payload = null; }
  }
  const row = payload && typeof payload === 'object' ? payload as { active_shift?: unknown; stations?: unknown; phones?: unknown } : {};
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
    const phone = item as { phone?: unknown; holders?: unknown; active_count?: unknown; on_shift?: unknown };
    const number = readPhone(phone.phone);
    if (!number) return [];
    const holders = Array.isArray(phone.holders) ? phone.holders.filter((holder): holder is string => typeof holder === 'string' && holder.length > 0) : [];
    const option: SacPhoneOption = { phone: number, holders, active_count: Math.max(0, Number(phone.active_count) || 0) };
    if (phone.on_shift === false) option.on_shift = false;
    else if (phone.on_shift === true) option.on_shift = true;
    return [option];
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

function demoCard(id: string, bank: string, holder: string, alias: string, ending: string, theme: string, active: boolean, shift: string): SacPhoneAccount {
  return { id, bank, holder, alias, cbu: `0000000000000000${ending}`, theme_key: theme, theme_background_path: null, theme_logo_path: null, active, shift_key: shift };
}

export const demoSacPhones: SacPhoneOption[] = [
  { phone: 1, holders: ['Bazan', 'Muñoz'], active_count: 2, on_shift: true, accounts: [
    demoCard('demo-1a', 'Banco Galicia', 'Muñoz', 'munos', '1234', 'galicia', true, 'morning'),
    demoCard('demo-1b', 'Banco Galicia', 'Bazan', 'bazan', '1233', 'galicia', true, 'morning'),
  ] },
  { phone: 2, holders: ['Max'], active_count: 1, on_shift: true, accounts: [
    demoCard('demo-2a', 'Lemon', 'Max Lemon', 'lemonlemon', '1233', 'lemon', true, 'morning'),
  ] },
  { phone: 3, holders: ['Maxima'], active_count: 0, on_shift: true, accounts: [
    demoCard('demo-3a', 'Mercado Pago', 'Maxima Mercado Pago', 'max.mp', '1254', 'mercado-pago', false, 'morning'),
  ] },
  { phone: 4, holders: ['Mena'], active_count: 0, on_shift: false, accounts: [
    demoCard('demo-4a', 'Naranja X', 'Maxmax Mena', 'maxmax.nx', '1231', 'naranja-x', true, 'night'),
  ] },
  { phone: 5, holders: ['Acosta'], active_count: 1, on_shift: true, accounts: [
    demoCard('demo-5a', 'Ualá', 'Acosta', 'acosta.uala', '4588', 'uala', true, 'morning'),
  ] },
];
