import assert from 'node:assert/strict';
import test from 'node:test';
import { MINIMUM_WITHDRAWAL_AMOUNT, parseWithdrawalAmount, parseAmount, InputError } from '../supabase/functions/_shared/validation.ts';

test('retiros desde 5000 inclusive con formatos locales y centavos', () => {
  assert.equal(MINIMUM_WITHDRAWAL_AMOUNT, 5000);
  for (const raw of ['5000', '5.000', '5000,00', '5.000,00']) assert.equal(parseWithdrawalAmount(raw), 5000);
  assert.equal(parseWithdrawalAmount('5.000,01'), 5000.01);
  assert.equal(parseWithdrawalAmount('10.000.000'), 10000000);
});

test('rechaza montos inferiores al mínimo sin cambiar el parser de las cargas', () => {
  for (const raw of ['1', '1000', '4.999', '4999.99', '4.999,99']) {
    assert.throws(() => parseWithdrawalAmount(raw), { name: 'InputError', message: 'El retiro mínimo es de $5.000.' });
  }
  for (const raw of ['', '0', '-5000', '5e3', 'Infinity', null]) assert.throws(() => parseWithdrawalAmount(raw), InputError);
  assert.equal(parseAmount('1.000'), 1000);
});
