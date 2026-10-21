import type { Bank } from './lib';

export type WithdrawalSourceAccount = Omit<Bank, 'assignment_id'> & {
  shift_key: string;
  last_used_at: string | null;
  ready_at: string | null;
  server_now: string;
};

export function cooldownSeconds(account: Pick<WithdrawalSourceAccount, 'ready_at'>, now: number): number {
  if (!account.ready_at) return 0;
  return Math.max(0, Math.ceil((Date.parse(account.ready_at) - now) / 1000));
}

export function cooldownLabel(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
