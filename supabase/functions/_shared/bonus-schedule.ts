export type BonusSchedule = {
  bonus_start_time?: string | null;
  bonus_end_time?: string | null;
  bonus_days?: number[] | null;
};
export const bonusScheduleColumns = 'bonus_start_time,bonus_end_time,bonus_days';
export const bonusWeekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const everyBonusDay = [1, 2, 3, 4, 5, 6, 7];
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function parts(at: number) {
  const values = Object.fromEntries(clock.formatToParts(at).map(part => [part.type, part.value]));
  const year = Number(values.year), month = Number(values.month), day = Number(values.day);
  const date = Date.UTC(year, month - 1, day);
  return { date, weekday: new Date(date).getUTCDay() || 7, hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second) };
}

function minutes(value: string | null | undefined): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

export function hasBonusSchedule(row: BonusSchedule): boolean {
  return row.bonus_start_time != null || row.bonus_end_time != null;
}

export function parseBonusSchedule(enabled: boolean, start: string, end: string, days: number[]) {
  if (!enabled) return { bonus_start_time: null, bonus_end_time: null, bonus_days: [...everyBonusDay] };
  if (minutes(start) === null || minutes(end) === null || minutes(start) === minutes(end)) throw new Error('Elegí un horario de inicio y fin diferente, con horas y minutos válidos.');
  const unique = [...new Set(days)].sort((a, b) => a - b);
  if (!unique.length || unique.some(day => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error('Elegí al menos un día de la semana.');
  return { bonus_start_time: start.slice(0, 5), bonus_end_time: end.slice(0, 5), bonus_days: unique };
}

export function bonusScheduleOpen(row: BonusSchedule, at = Date.now()): boolean {
  if (!hasBonusSchedule(row)) return true;
  const start = minutes(row.bonus_start_time), end = minutes(row.bonus_end_time);
  const days = row.bonus_days;
  if (start === null || end === null || start === end || !days?.length || !Number.isFinite(at)) return false;
  const local = parts(at);
  const current = local.hour * 60 + local.minute;
  if (start < end) return days.includes(local.weekday) && current >= start && current < end;
  // El día elegido es el del inicio: viernes 23:00–02:00 termina el sábado.
  return current >= start ? days.includes(local.weekday) : current < end && days.includes(local.weekday === 1 ? 7 : local.weekday - 1);
}

export function bonusScheduleText(row: BonusSchedule): string {
  if (!hasBonusSchedule(row)) return '';
  const days = row.bonus_days ?? [];
  const label = days.length === 7 ? 'Todos los días' : days.map(day => bonusWeekdays[day - 1]).filter(Boolean).join(', ');
  const overnight = (minutes(row.bonus_start_time) ?? 0) > (minutes(row.bonus_end_time) ?? 0) ? ' (hasta el día siguiente)' : '';
  return `${label} · ${row.bonus_start_time?.slice(0, 5)}–${row.bonus_end_time?.slice(0, 5)}${overnight} · hora de Paraguay`;
}

function fromLocal(localEpoch: number) {
  let result = localEpoch;
  for (let i = 0; i < 3; i++) {
    const local = parts(result);
    const offset = local.date + (local.hour * 3600 + local.minute * 60 + local.second) * 1000 - result;
    result = localEpoch - offset;
  }
  return result;
}

// Un temporizador local hasta la próxima apertura/cierre; sin sondeo de red.
export function nextBonusScheduleChange(rows: readonly BonusSchedule[], at = Date.now()): number | null {
  if (!Number.isFinite(at) || !rows.some(hasBonusSchedule)) return null;
  let next = Infinity;
  const today = parts(at).date;
  for (const row of rows) {
    if (!hasBonusSchedule(row)) continue;
    const start = minutes(row.bonus_start_time), end = minutes(row.bonus_end_time);
    if (start === null || end === null || start === end || !row.bonus_days?.length) continue;
    for (let offset = -1; offset <= 7; offset++) {
      const date = today + offset * 86400000;
      if (!row.bonus_days.includes(new Date(date).getUTCDay() || 7)) continue;
      for (const minute of [start, end + (end < start ? 1440 : 0)]) {
        const boundary = fromLocal(date + minute * 60000);
        if (boundary > at && boundary < next) next = boundary;
      }
    }
  }
  return Number.isFinite(next) ? next : null;
}

// The earliest usable instant, including a cooldown that can end outside the window.
export function nextBonusScheduleOpen(row: BonusSchedule, at = Date.now()): number | null {
  if (!Number.isFinite(at)) return null;
  if (bonusScheduleOpen(row, at)) return at;
  const next = nextBonusScheduleChange([row], at);
  return next !== null && bonusScheduleOpen(row, next) ? next : null;
}
