export type BonusMode = 'percent' | 'fixed';

export type BonusRule = {
  bonus_mode: BonusMode;
  bonus_percent: number;
  bonus_amount: number;
  min_amount: number;
  max_amount: number;
};

const maxMoney = 999999999;
export const moneyInputMaxLength = 18;
// Miles con punto y decimales con coma (10.000 o 10.000,50), o un decimal con coma o punto (10000,50).
export const moneyInputPattern = '[0-9]{1,3}(\\.[0-9]{3})*(,[0-9]{1,2})?|[0-9]+([.,][0-9]{1,2})?';

export function readMoney(raw: string): number | null {
  const value = raw.trim().replace(/[$\s]/g, '');
  if (!value || value.length > moneyInputMaxLength) return null;
  let normal: string;
  if (/^[0-9]{1,3}(\.[0-9]{3})+(,[0-9]{1,2})?$/.test(value)) normal = value.replace(/\./g, '').replace(',', '.');
  else if (/^[0-9]+([.,][0-9]{1,2})?$/.test(value)) normal = value.replace(',', '.');
  else return null;
  const amount = Math.round(Number(normal) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > maxMoney) return null;
  return amount;
}

export function canonicalMoney(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function percentText(percent: number): string {
  const rounded = Math.round(percent * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

export function asBonusRule(row: {
  bonus_mode?: string | null;
  bonus_percent?: number | null;
  bonus_amount?: number | null;
  min_amount?: number | null;
  max_amount?: number | null;
}): BonusRule {
  const percent = Number(row.bonus_percent) || 0;
  const amount = Number(row.bonus_amount) || 0;
  const mode: BonusMode = row.bonus_mode === 'fixed' || (row.bonus_mode !== 'percent' && amount > 0 && percent <= 0) ? 'fixed' : 'percent';
  let min = Number(row.min_amount);
  let max = Number(row.max_amount);
  if (!Number.isFinite(min) || min < 0) min = 0;
  if (!Number.isFinite(max) || max < 0) max = 0;
  // Bonos de porcentaje creados antes de existir el rango siguen disponibles en cualquier carga.
  if (mode === 'percent' && percent > 0 && min <= 0 && max <= 0) {
    min = 0.01;
    max = maxMoney;
  }
  return {
    bonus_mode: mode,
    bonus_percent: mode === 'percent' ? percent : 0,
    bonus_amount: mode === 'fixed' ? amount : 0,
    min_amount: min,
    max_amount: max,
  };
}

export function bonusEnabled(rule: BonusRule, amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0 || amount > maxMoney) return false;
  if (amount < rule.min_amount || amount > rule.max_amount) return false;
  return rule.bonus_mode === 'fixed' ? rule.bonus_amount > 0 : rule.bonus_percent > 0;
}
