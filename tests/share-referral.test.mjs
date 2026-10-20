import assert from 'node:assert/strict';
import test from 'node:test';
import { referralShareUrl } from '../src/share-referral.ts';

test('el enlace recomienda con usuario y WhatsApp asignado sin nombres internos', () => {
  const url = referralShareUrl('max', 'https://wa.me/595981123456');
  assert.ok(url?.startsWith('https://wa.me/?text='));
  const message = new URL(url).searchParams.get('text');
  assert.match(message, /Gana777/);
  assert.match(message, /\+595981123456/);
  assert.match(message, /usuario max/);
  assert.match(message, /solicitar uno al instante/);
  assert.doesNotMatch(message, /principal/i);
});

test('no ofrece compartir sin usuario o WhatsApp asignado válido', () => {
  assert.equal(referralShareUrl(null, 'https://wa.me/595981123456'), null);
  assert.equal(referralShareUrl('max', null), null);
  assert.equal(referralShareUrl('max', 'https://example.com/595981123456'), null);
});
