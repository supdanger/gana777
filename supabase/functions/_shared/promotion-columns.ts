import { bonusScheduleColumns } from './bonus-schedule.ts';

// Public schema capability, kept in memory. A page/worker restart rechecks it.
let schedules: boolean | null = null;
type Result = { error: { message?: string } | null };
export async function readBonusScheduleColumns<T extends Result>(read: (columns: string) => PromiseLike<T>, columns: string) {
  const extended = schedules !== false;
  let result = await read(extended ? `${columns},${bonusScheduleColumns}` : columns);
  if (extended && result.error && /bonus_start_time|bonus_end_time|bonus_days/i.test(result.error.message ?? '')) {
    schedules = false;
    result = await read(columns);
  } else if (extended && !result.error) schedules = true;
  return { result, scheduleSupported: schedules === true };
}
