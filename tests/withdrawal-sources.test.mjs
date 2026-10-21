import assert from 'node:assert/strict';
import test from 'node:test';
import { cooldownLabel, cooldownSeconds } from '../src/withdrawal-sources.ts';

test('el enfriamiento se basa en la hora confirmada por el servidor', () => {
  const now = Date.parse('2026-10-21T15:00:00Z');
  assert.equal(cooldownSeconds({ ready_at: null }, now), 0);
  assert.equal(cooldownSeconds({ ready_at: '2026-10-21T15:10:00Z' }, now), 600);
  assert.equal(cooldownLabel(cooldownSeconds({ ready_at: '2026-10-21T15:01:01Z' }, now)), '01:01');
  assert.equal(cooldownSeconds({ ready_at: '2026-10-21T14:59:59Z' }, now), 0);
});
