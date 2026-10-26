export type WheelSlice = { amount: number; slots: number };

export function buildWheelSequence(prizes: readonly WheelSlice[], random: () => number = Math.random): number[] {
  if (!prizes.length) throw new Error('La ruleta necesita al menos un premio.');
  const ordered = [...prizes].sort((left, right) => right.amount - left.amount);
  const seen = new Set<number>();
  let total = 0;
  for (const prize of ordered) {
    if (!Number.isInteger(prize.amount) || prize.amount <= 0 || prize.amount > 100_000_000) {
      throw new Error('Cada premio necesita un monto entero.');
    }
    if (!Number.isInteger(prize.slots) || prize.slots < 1 || prize.slots > 40) {
      throw new Error('Cada premio necesita entre 1 y 40 espacios.');
    }
    if (seen.has(prize.amount)) throw new Error('No puede haber dos premios con el mismo monto.');
    seen.add(prize.amount);
    total += prize.slots;
  }
  if (total > 60) throw new Error('La ruleta acepta hasta 60 espacios.');
  const board: Array<number | null> = Array.from({ length: total }, () => null);
  for (const prize of ordered) {
    const band = total / prize.slots;
    for (let index = 0; index < prize.slots; index += 1) {
      const start = Math.floor(index * band);
      const end = Math.max(start, Math.floor((index + 1) * band) - 1);
      const free = [];
      for (let position = start; position <= end; position += 1) if (board[position] === null) free.push(position);
      let chosen = free.length ? free[Math.floor(random() * free.length)] : null;
      for (let distance = 1; chosen === null && distance < total; distance += 1) {
        const before = start - distance;
        const after = end + distance;
        if (before >= 0 && board[before] === null) chosen = before;
        else if (after < total && board[after] === null) chosen = after;
      }
      if (chosen === null) throw new Error('No hay espacio para armar la ruleta.');
      board[chosen] = prize.amount;
    }
  }
  return board.map(amount => {
    if (amount === null) throw new Error('No hay espacio para armar la ruleta.');
    return amount;
  });
}

const amountLabel = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

export function wheelAmountLabel(amount: number) {
  return amountLabel.format(amount);
}

export function wheelCycleSummary(prizes: readonly WheelSlice[]) {
  const total = prizes.reduce((sum, prize) => sum + prize.slots, 0);
  const cycleTotal = prizes.reduce((sum, prize) => sum + prize.amount * prize.slots, 0);
  return {
    total,
    cycleTotal,
    average: total ? cycleTotal / total : 0,
    monthTotal: total ? cycleTotal * 30 / total : 0,
    monthCount: (slots: number) => total ? slots * 30 / total : 0,
  };
}

export function wheelLead(prizes: readonly WheelSlice[]) {
  if (!prizes.length) return 'Cuando haya premios activos, vas a poder girar.';
  const summary = wheelCycleSummary(prizes);
  const biggest = [...prizes].sort((left, right) => right.amount - left.amount)[0];
  const rounded = Math.round(summary.monthCount(biggest.slots) * 10) / 10;
  const times = Number.isInteger(rounded) ? String(rounded) : rounded.toLocaleString('es-AR', { maximumFractionDigits: 1 });
  return `En 30 giros, el premio de ${wheelAmountLabel(biggest.amount)} entra ${times} ${rounded === 1 ? 'vez' : 'veces'}.`;
}

// Cada espacio es una porción del mismo tamaño. El mismo monto se reparte en la rueda
// para que no forme un solo bloque: si no, la ruleta parece un gráfico.
// El orden es solo visual. No es el mazo del jugador.
export function wheelFaces(prizes: readonly WheelSlice[]): number[] {
  const total = prizes.reduce((sum, prize) => sum + prize.slots, 0);
  if (!prizes.length || !Number.isInteger(total) || total < 1) return [];
  const board: Array<number | null> = Array.from({ length: total }, () => null);
  const order = [...prizes].sort((left, right) => right.slots - left.slots || left.amount - right.amount);
  for (const prize of order) {
    for (let copy = 0; copy < prize.slots; copy += 1) {
      let chosen = -1;
      let bestGap = -1;
      for (let position = 0; position < total; position += 1) {
        if (board[position] !== null) continue;
        let nearest = total;
        for (let other = 0; other < total; other += 1) {
          if (board[other] !== prize.amount) continue;
          const distance = Math.min((position - other + total) % total, (other - position + total) % total);
          if (distance < nearest) nearest = distance;
        }
        if (nearest > bestGap) {
          bestGap = nearest;
          chosen = position;
        }
      }
      if (chosen < 0) throw new Error('No hay espacio para armar la ruleta.');
      board[chosen] = prize.amount;
    }
  }
  const start = board.indexOf(prizes[0].amount);
  const faces = start > 0 ? board.slice(start).concat(board.slice(0, start)) : board;
  return faces.map(amount => {
    if (amount === null) throw new Error('No hay espacio para armar la ruleta.');
    return amount;
  });
}

// La primera porción queda centrada en el puntero. El valor es el giro horario, en grados, hasta el centro de una porción de ese monto.
export function wheelSectorOffset(prizes: readonly WheelSlice[], amount: number, pick = 0): number | null {
  const faces = wheelFaces(prizes);
  const matches: number[] = [];
  for (let index = 0; index < faces.length; index += 1) if (faces[index] === amount) matches.push(index);
  if (!matches.length) return null;
  const slot = matches[Math.abs(Math.trunc(pick)) % matches.length];
  return slot * (360 / faces.length);
}

export function wheelWaitLabel(nextSpinAt: string | null, now: number): string | null {
  if (!nextSpinAt) return null;
  const remaining = Date.parse(nextSpinAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const seconds = Math.ceil(remaining / 1000);
  const clock = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
  return `Otro giro en ${clock}`;
}

export function wheelLandingRotation(current: number, offset: number, turns = 5) {
  const normalized = ((offset % 360) + 360) % 360;
  const desired = (360 - normalized) % 360;
  const currentMod = ((current % 360) + 360) % 360;
  const delta = (desired - currentMod + 360) % 360;
  return current + delta + turns * 360;
}
