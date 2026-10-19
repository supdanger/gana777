import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asBonusRule, bonusEnabled, canonicalMoney, readMoney } from '../supabase/functions/_shared/bonus-rule.ts';

const percent = asBonusRule({ bonus_mode: 'percent', bonus_percent: 10, bonus_amount: 0, min_amount: 10000, max_amount: 50000 });
const fixed = asBonusRule({ bonus_mode: 'fixed', bonus_percent: 0, bonus_amount: 5000, min_amount: 20000, max_amount: 20000 });

test('a bonus is enabled only inside its minimum and maximum', () => {
  assert.equal(bonusEnabled(percent, 10000), true);
  assert.equal(bonusEnabled(percent, 50000), true);
  assert.equal(bonusEnabled(percent, 9999.99), false);
  assert.equal(bonusEnabled(percent, 50000.01), false);
  assert.equal(bonusEnabled(fixed, 20000), true);
  assert.equal(bonusEnabled(fixed, 20000.01), false);
});

test('an Argentine minimum shows the bonus, including both ends of the range', () => {
  assert.equal(readMoney('10.000'), 10000);
  assert.equal(readMoney('10.000,00'), 10000);
  assert.equal(readMoney('$ 10.000'), 10000);
  assert.equal(readMoney('10000'), 10000);
  assert.equal(readMoney('9.999,99'), 9999.99);
  assert.equal(readMoney('50.000,01'), 50000.01);
  assert.equal(readMoney('10.50'), 10.5);
  assert.equal(readMoney(''), null);
  assert.equal(readMoney('10.'), null);
  assert.equal(bonusEnabled(percent, readMoney('10.000')), true);
  assert.equal(bonusEnabled(percent, readMoney('10.000,00')), true);
  assert.equal(bonusEnabled(percent, readMoney('9.999')), false);
  assert.equal(bonusEnabled(percent, readMoney('50.000')), true);
  assert.equal(canonicalMoney(10000), '10000');
  assert.equal(canonicalMoney(10000.5), '10000.50');
});

test('older percentage bonuses without a saved range stay available', () => {
  const legacy = asBonusRule({ bonus_percent: 15 });
  assert.equal(bonusEnabled(legacy, 100), true);
  assert.equal(bonusEnabled(legacy, 999999999), true);
  assert.equal(bonusEnabled(asBonusRule({ bonus_percent: 0 }), 10000), false);
});
