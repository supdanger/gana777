import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bonusCounters } from '../src/bonus-counters.ts';

test('cuenta cada tipo de bono y deja afuera los rechazados', () => {
  const rows = [
    { kind: 'deposit', status: 'approved', amount: 10000, bonus_percent: 20 },
    { kind: 'deposit', status: 'pending', amount: 5000, bonus_percent: 20 },
    { kind: 'deposit', status: 'approved', amount: 8000, bonus_percent: 0 },
    { kind: 'deposit', status: 'approved', amount: 40000, bonus_percent: 0, bonus_amount: 5000 },
    { kind: 'deposit', status: 'rejected', amount: 9000, bonus_percent: 20 },
    { kind: 'withdrawal', status: 'approved', amount: 4000, bonus_percent: 20 },
  ];
  assert.deepEqual(bonusCounters(rows), [
    { key: 'p:20', title: '+20%', loads: 2, bonusTotal: 3000 },
    { key: 'f:5000', title: '+$5.000', loads: 1, bonusTotal: 5000 },
    { key: 'none', title: 'Sin bono', loads: 1, bonusTotal: 0 },
  ]);
});
