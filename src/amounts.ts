export function creditAmounts(amount: number, bonusPercent: number, bonusAmount = 0) {
  const amountCents = Math.round(amount * 100);
  const bonusCents = bonusPercent > 0 ? Math.round(amountCents * bonusPercent / 100) : Math.round(Math.max(0, bonusAmount) * 100);
  const total = (amountCents + bonusCents) / 100;
  return {
    bonus: bonusCents / 100,
    total,
    copyValue: total.toFixed(2).replace(/\.00$/, ''),
  };
}
