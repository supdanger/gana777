export function groupReferralRewards<T extends {
  referrer_name: string;
  referred_name: string;
  created_at: string;
  beneficiary_role: 'referrer' | 'referred';
}>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.referrer_name, row.referred_name, row.created_at]);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()].map(group => group.sort((a, b) =>
    Number(a.beneficiary_role === 'referred') - Number(b.beneficiary_role === 'referred')
  ));
}
