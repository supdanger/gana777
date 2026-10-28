import { readMoney, type BonusMode, type BonusRule } from './bonus-rule.ts';

export class InputError extends Error {
  constructor(message: string) { super(message); this.name = 'InputError'; }
}
const forbiddenText = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u;
export function parseBonusTitle(raw: unknown): string {
  if (typeof raw !== 'string') throw new InputError('Ingresá el nombre del bono.');
  const title = raw.normalize('NFC').trim().replace(/ {2,}/g, ' ');
  if (title.length < 2 || title.length > 80 || forbiddenText.test(title) || !/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'+%-]*[\p{L}\p{M}\p{N}%]$/u.test(title)) throw new InputError('El nombre del bono debe tener entre 2 y 80 caracteres.');
  return title;
}
export function parseBonusRewardLabel(raw: unknown): string {
  if (typeof raw !== 'string') throw new InputError('Ingresá el nombre del premio de giros gratis.');
  const label = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (label.length < 2 || label.length > 80 || forbiddenText.test(label) || /[<>]/.test(label)) {
    throw new InputError('El premio de giros gratis debe tener entre 2 y 80 caracteres.');
  }
  return label;
}
export function parseBonusPercent(raw: unknown): number {
  if (typeof raw !== 'string') throw new InputError('Ingresá un porcentaje de bono válido.');
  const value = raw.trim();
  const percent = Number(value.replace(',', '.'));
  if (!/^[0-9]+([.,][0-9]{1,2})?$/.test(value) || !Number.isFinite(percent) || percent <= 0 || percent > 100) throw new InputError('El bono debe ser mayor a 0 y de hasta 100, con dos decimales como máximo.');
  return percent;
}
export function parseBonusMode(raw: unknown): BonusMode {
  if (raw === 'percent' || raw === 'fixed') return raw;
  throw new InputError('Elegí si el bono es un porcentaje o un monto fijo.');
}
export function parseBonusRule(form: FormData): BonusRule & { title: string } {
  const title = parseBonusTitle(form.get('title'));
  const bonus_mode = parseBonusMode(form.get('mode'));
  const min_amount = parseAmount(form.get('min_amount'));
  const max_amount = parseAmount(form.get('max_amount'));
  if (max_amount < min_amount) throw new InputError('El monto máximo tiene que ser igual o mayor que el mínimo.');
  if (bonus_mode === 'fixed') {
    return { title, bonus_mode, bonus_percent: 0, bonus_amount: parseAmount(form.get('value')), min_amount, max_amount };
  }
  return { title, bonus_mode, bonus_percent: parseBonusPercent(form.get('value')), bonus_amount: 0, min_amount, max_amount };
}
export function parseAmount(raw: unknown): number {
  if (typeof raw !== 'string') throw new InputError('Ingresá un monto válido.');
  const amount = readMoney(raw);
  if (amount === null) throw new InputError('Ingresá un monto válido, con hasta dos decimales.');
  return amount;
}
export function parseUuid(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) throw new InputError('La solicitud no es válida.');
  return raw;
}
export function parseBank(raw: unknown): string {
  if (typeof raw !== 'string') throw new InputError('Ingresá el banco.');
  const bank = raw.normalize('NFC').trim().replace(/ {2,}/g, ' ');
  if (bank.length < 2 || bank.length > 80 || forbiddenText.test(bank) || !/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'’-]*[\p{L}\p{M}\p{N}.]$/u.test(bank)) throw new InputError('El banco debe tener entre 2 y 80 caracteres.');
  return bank;
}
export function parseHolder(raw: unknown): string {
  if (typeof raw !== 'string') throw new InputError('Ingresá el nombre del titular.');
  const name = raw.normalize('NFC').trim().replace(/ {2,}/g, ' ');
  if (name.length < 2 || name.length > 120 || !/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*[\p{L}\p{M}.]$/u.test(name)) throw new InputError('El titular debe tener entre 2 y 120 caracteres: letras, espacios, puntos, apóstrofes o guiones.');
  return name;
}
export function parseCbu(raw: unknown): string {
  if (typeof raw !== 'string') throw new InputError('Ingresá un CBU o CVU válido.');
  const formatted = raw.trim();
  if (!formatted || formatted.length > 34 || !/^[0-9. -]+$/.test(formatted)) {
    throw new InputError('El CBU o CVU solo puede contener números, puntos, espacios o guiones.');
  }
  const normalized = formatted.replace(/[. -]/g, '');
  if (!/^[0-9]{22}$/.test(normalized)) throw new InputError('El CBU o CVU debe contener exactamente 22 números.');
  return normalized;
}
export function parseAlias(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') throw new InputError('El alias no es válido.');
  const alias = raw.trim();
  if (!alias) return null;
  if (!/^[a-zA-Z0-9.-]{6,20}$/.test(alias)) throw new InputError('El alias debe tener entre 6 y 20 caracteres: letras, números, puntos o guiones.');
  return alias;
}
export function parseMessage(raw: unknown): string {
  if (typeof raw !== 'string') throw new InputError('Escribí un mensaje válido.');
  const body = raw.normalize('NFC').trim();
  if (!body || body.length > 2000 || forbiddenText.test(body)) throw new InputError('El mensaje debe tener entre 1 y 2000 caracteres, sin caracteres de control.');
  return body;
}
export function parseEmail(raw: unknown): string {
  if (typeof raw !== 'string') throw new InputError('Ingresá un correo válido.');
  const email = raw.trim();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || forbiddenText.test(email)) throw new InputError('Ingresá un correo válido.');
  return email;
}
export function assertFormFields(form: FormData, allowed: readonly string[]): void {
  const seen = new Set<string>();
  for (const key of form.keys()) {
    if (!allowed.includes(key) || seen.has(key)) throw new InputError('El formulario contiene datos no permitidos.');
    seen.add(key);
  }
}
export async function validateReceipt(file: unknown): Promise<File> {
  if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) throw new InputError('Subí un comprobante de hasta 5 MB.');
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const matches: Record<string, boolean> = {
    'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png': [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value),
    'image/webp': new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP',
    'application/pdf': new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-',
  };
  if (!matches[file.type]) throw new InputError('El comprobante debe ser una imagen JPG, PNG, WebP o un PDF válido.');
  return file;
}
