import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shifts, shiftLabel } from '../src/shifts.ts';

test('defines the three exclusive work shifts in display order', () => {
  assert.deepEqual(shifts.map(shift => shift.key), ['morning', 'afternoon', 'night']);
  assert.equal(new Set(shifts.map(shift => shift.key)).size, 3);
  assert.equal(shiftLabel.afternoon, 'Turno tarde');
});
