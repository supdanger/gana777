export const shifts = [
  { key: 'morning', label: 'Turno mañana' },
  { key: 'afternoon', label: 'Turno tarde' },
  { key: 'night', label: 'Turno noche' },
] as const;
export type ShiftKey = typeof shifts[number]['key'];
export const shiftLabel = Object.fromEntries(shifts.map(shift => [shift.key, shift.label])) as Record<ShiftKey, string>;
