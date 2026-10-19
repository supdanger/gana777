export type BonusCounter = { key: string; title: string; loads: number; bonusTotal: number };
type CountedDeposit = { kind: string; status: string; amount: number; bonus_percent: number; bonus_amount?: number };

function percentLabel(percent: number) {
  const rounded = Math.round(percent * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
  return `+${text}%`;
}

function fixedLabel(amount: number) {
  return `+$${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(amount)}`;
}

export function bonusCounters(rows: CountedDeposit[]): BonusCounter[] {
  const grouped = new Map<string, BonusCounter>();
  for (const row of rows) {
    if (row.kind !== 'deposit' || (row.status !== 'pending' && row.status !== 'approved')) continue;
    const percent = Number(row.bonus_percent) || 0;
    const fixed = Number(row.bonus_amount) || 0;
    const key = percent > 0 ? `p:${percent}` : fixed > 0 ? `f:${fixed}` : 'none';
    const title = percent > 0 ? percentLabel(percent) : fixed > 0 ? fixedLabel(fixed) : 'Sin bono';
    const current = grouped.get(key) ?? { key, title, loads: 0, bonusTotal: 0 };
    current.loads += 1;
    const amountCents = Math.round((Number(row.amount) || 0) * 100);
    current.bonusTotal += percent > 0 ? Math.round(amountCents * percent / 100) / 100 : fixed;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : b.loads - a.loads));
}
