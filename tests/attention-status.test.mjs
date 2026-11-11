import assert from 'node:assert/strict';
import test from 'node:test';
import { attentionWait } from '../src/attention-status.ts';

test('la espera muestra minutos, horas y días sin valores negativos o inválidos', () => {
  const now = Date.parse('2026-11-11T15:00:00Z');
  assert.equal(attentionWait('2026-11-11T15:01:00Z', now), 'Espera < 1 min');
  assert.equal(attentionWait('2026-11-11T14:55:00Z', now), 'Espera 5 min');
  assert.equal(attentionWait('2026-11-11T13:55:00Z', now), 'Espera 1 h 5 min');
  assert.equal(attentionWait('2026-11-09T15:00:00Z', now), 'Espera 2 d');
  assert.equal(attentionWait('invalid', now), 'Por responder');
});
