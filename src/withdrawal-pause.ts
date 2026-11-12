export const WITHDRAWAL_PAUSE_OPTIONS = [
  { minutes: 15, label: '15 minutos' },
  { minutes: 120, label: '2 horas' },
  { minutes: 360, label: '6 horas' },
  { minutes: 720, label: '12 horas' },
] as const;
export type WithdrawalPauseMinutes = typeof WITHDRAWAL_PAUSE_OPTIONS[number]['minutes'];
export type WithdrawalRejection = { reason: string; minutes: WithdrawalPauseMinutes | null };
export function validWithdrawalPause(value: number): value is WithdrawalPauseMinutes {
  return WITHDRAWAL_PAUSE_OPTIONS.some(option => option.minutes === value);
}
