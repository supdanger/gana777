import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditAmounts } from '../src/amounts.ts';

test('calculates the bonus and final credit amount in cents', () => {
  assert.deepEqual(creditAmounts(150000, 20), { bonus: 30000, total: 180000, copyValue: '180000' });
  assert.deepEqual(creditAmounts(100.01, 10), { bonus: 10, total: 110.01, copyValue: '110.01' });
});

test('keeps the requested amount unchanged when there is no bonus', () => {
  assert.deepEqual(creditAmounts(85000, 0), { bonus: 0, total: 85000, copyValue: '85000' });
});

test('adds a fixed bonus amount when there is no percentage', () => {
  assert.deepEqual(creditAmounts(20000, 0, 5000), { bonus: 5000, total: 25000, copyValue: '25000' });
});
