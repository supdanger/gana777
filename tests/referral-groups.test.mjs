import assert from 'node:assert/strict';
import test from 'node:test';
import { groupReferralRewards } from '../src/referral-groups.ts';

test('los dos premios de una recomendación comparten tarjeta y conservan su beneficiario', () => {
  const rows = [
    { id: 'new-player', referrer_name: 'max', referred_name: 'max3', created_at: '2026-10-20T04:02:00Z', beneficiary_role: 'referred' },
    { id: 'other', referrer_name: 'max', referred_name: 'luna', created_at: '2026-10-20T04:02:00Z', beneficiary_role: 'referrer' },
    { id: 'referrer', referrer_name: 'max', referred_name: 'max3', created_at: '2026-10-20T04:02:00Z', beneficiary_role: 'referrer' },
  ];
  const groups = groupReferralRewards(rows);
  assert.deepEqual(groups.map(group => group.map(row => row.id)), [['referrer', 'new-player'], ['other']]);
});
