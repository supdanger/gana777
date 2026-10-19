import assert from 'node:assert/strict';
import test from 'node:test';
import { USER_HISTORY_PAGE_SIZE, userHistoryWindow } from '../src/user-history.ts';

test('el historial muestra como máximo cinco movimientos por página', () => {
  assert.equal(USER_HISTORY_PAGE_SIZE, 5);
  assert.deepEqual(userHistoryWindow(0, 12), { current: 0, pages: 3, from: 0, to: 5 });
  assert.deepEqual(userHistoryWindow(1, 12), { current: 1, pages: 3, from: 5, to: 10 });
  assert.deepEqual(userHistoryWindow(2, 12), { current: 2, pages: 3, from: 10, to: 12 });
});

test('una página inválida se ajusta al rango disponible', () => {
  assert.deepEqual(userHistoryWindow(9, 6), { current: 1, pages: 2, from: 5, to: 6 });
  assert.deepEqual(userHistoryWindow(-2, 0), { current: 0, pages: 1, from: 0, to: 0 });
});
