import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWheelSequence, wheelCycleSummary, wheelFaces, wheelLandingRotation, wheelLead, wheelSectorOffset, wheelWaitLabel } from '../src/wheel-sequence.ts';

const recipe = [
  { amount: 500, slots: 6 },
  { amount: 1000, slots: 5 },
  { amount: 2000, slots: 3 },
  { amount: 10000, slots: 1 },
];

test('el ciclo de 15 entrega el premio grande dos veces cada 30 giros', () => {
  const display = [
    { amount: 500, slots: 6 },
    { amount: 1000, slots: 5 },
    { amount: 2000, slots: 3 },
    { amount: 10000, slots: 1 },
  ];
  const sequence = buildWheelSequence(recipe, () => 0);
  assert.deepEqual(sequence, [10000, 2000, 1000, 1000, 500, 2000, 1000, 500, 500, 1000, 2000, 500, 1000, 500, 500]);
  assert.equal(sequence.filter(amount => amount === 10000).length, 1);
  assert.equal(sequence.filter(amount => amount === 2000).length, 3);
  const summary = wheelCycleSummary(recipe);
  assert.equal(summary.total, 15);
  assert.equal(summary.cycleTotal, 24000);
  assert.equal(summary.monthTotal, 48000);
  assert.equal(summary.average, 1600);
  assert.equal(summary.monthCount(1), 2);
  assert.equal(wheelLead(display), 'En 30 giros, el premio de 10.000 entra 2 veces.');
  const faces = wheelFaces(display);
  assert.deepEqual(faces, [500, 1000, 2000, 500, 1000, 500, 1000, 500, 1000, 500, 2000, 500, 1000, 2000, 10000]);
  assert.equal(faces.filter((amount, index) => amount === faces[(index + 1) % faces.length]).length, 0);
  assert.equal(wheelSectorOffset(display, 500), 0);
  assert.equal(wheelSectorOffset(display, 10000), 336);
  assert.equal(wheelSectorOffset(display, 500, 1), 72);
  assert.equal(wheelLandingRotation(0, 0), 1800);
  assert.equal(wheelLandingRotation(0, 336), 1824);
});

test('el cronómetro de la tarjeta cuenta lo que falta para el otro giro', () => {
  const now = Date.parse('2026-10-26T15:00:00.000Z');
  assert.equal(wheelWaitLabel(null, now), null);
  assert.equal(wheelWaitLabel(new Date(now - 1000).toISOString(), now), null);
  assert.equal(wheelWaitLabel(new Date(now).toISOString(), now), null);
  assert.equal(wheelWaitLabel(new Date(now + (5 * 3600 + 3 * 60 + 9) * 1000).toISOString(), now), 'Otro giro en 05:03:09');
  assert.equal(wheelWaitLabel(new Date(now + 1).toISOString(), now), 'Otro giro en 00:00:01');
});

test('rechaza una ruleta sin premios distintos', () => {
  assert.throws(() => buildWheelSequence([]), /al menos un premio/);
  assert.throws(() => buildWheelSequence([{ amount: 500, slots: 1 }, { amount: 500, slots: 1 }]), /mismo monto/);
  assert.throws(() => buildWheelSequence([{ amount: 500, slots: 61 }]), /40 espacios|60 espacios/);
});
