import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEPOSIT_PAGE_SIZE, depositWindow } from '../src/deposit-page.ts';

test('cada página de cargas pide 30 filas y no más', () => {
  assert.equal(DEPOSIT_PAGE_SIZE, 30);
  assert.deepEqual(depositWindow(0, 0), { current: 0, pages: 1, from: 0, to: 29 });
  assert.deepEqual(depositWindow(0, 30), { current: 0, pages: 1, from: 0, to: 29 });
  assert.deepEqual(depositWindow(0, 31), { current: 0, pages: 2, from: 0, to: 29 });
  assert.deepEqual(depositWindow(1, 31), { current: 1, pages: 2, from: 30, to: 59 });
});

test('una página fuera de rango vuelve a la última con datos', () => {
  assert.deepEqual(depositWindow(8, 31), { current: 1, pages: 2, from: 30, to: 59 });
  assert.deepEqual(depositWindow(-1, 10), { current: 0, pages: 1, from: 0, to: 29 });
});
