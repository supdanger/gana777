import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalFootprint } from '../supabase/functions/_shared/footprint.ts';

const sample = {
  canvas: 'a'.repeat(64),
  renderer: 'Apple GPU',
  screen: '390x844x300',
  cores: '6',
  touch: '5',
  platform: 'iPhone',
};

test('arma una huella estable sin usar la red', () => {
  assert.equal(canonicalFootprint(sample), canonicalFootprint({ ...sample, ip: '192.0.2.10' }));
  assert.match(canonicalFootprint(sample), /^canvas=a{64}\nrenderer=Apple GPU\nscreen=390x844x300\ncores=6\ntouch=5\nplatform=iPhone$/);
});

test('rechaza una huella incompleta o alterada', () => {
  assert.equal(canonicalFootprint({ ...sample, canvas: 'corta' }), null);
  assert.equal(canonicalFootprint({ ...sample, renderer: 'GPU con eñe' }), null);
  assert.equal(canonicalFootprint({ ...sample, screen: '' }), null);
  assert.equal(canonicalFootprint(null), null);
});
