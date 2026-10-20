import assert from 'node:assert/strict';
import test from 'node:test';
import { referralShareMessage, referralShareUrl } from '../src/share-referral.ts';

test('el enlace recomienda con usuario y WhatsApp asignado sin nombres internos', () => {
  const url = referralShareUrl('max', 'https://wa.me/595981123456');
  assert.ok(url?.startsWith('https://wa.me/?text='));
  const message = new URL(url).searchParams.get('text');
  assert.equal(referralShareMessage('max', 'https://wa.me/595981123456'), message);
  assert.equal(message, [
    '*Te recomiendo gana777bet.com* 🎰',
    '',
    '*Agendá este número*',
    '+595981123456 como Gana777',
    '',
    '*¿Todavía no tenés usuario?*',
    'Escribinos por WhatsApp con tu nombre y te creamos la cuenta al instante:',
    'https://wa.me/595981123456',
    '',
    '*Recomendado por:* max',
  ].join('\n'));
  assert.doesNotMatch(message, /principal/i);
});

test('no ofrece compartir sin usuario o WhatsApp asignado válido', () => {
  assert.equal(referralShareUrl(null, 'https://wa.me/595981123456'), null);
  assert.equal(referralShareUrl('max', null), null);
  assert.equal(referralShareUrl('max', 'https://example.com/595981123456'), null);
});
