import assert from 'node:assert/strict';
import test from 'node:test';
import { pickExistingIpAccount } from '../supabase/functions/_shared/ip-account.ts';

test('elige la cuenta ya creada en esa IP antes que un intento nuevo', () => {
  const match = pickExistingIpAccount([
    { id: 'new', username: 'otro', status: 'pending', player_user_id: null, ip_blocked: true },
    { id: 'user', username: 'fortuna852', status: 'approved', player_user_id: 'abc' },
  ]);
  assert.equal(match?.username, 'fortuna852');
});

test('si todavía no hay usuario, usa la solicitud pendiente de esa IP', () => {
  const match = pickExistingIpAccount([
    { id: 'pending', username: 'fortuna852', status: 'pending', player_user_id: null, ip_blocked: false },
  ]);
  assert.equal(match?.id, 'pending');
});

test('un aviso de IP repetida o una solicitud cerrada no cuentan como cuenta', () => {
  assert.equal(pickExistingIpAccount([
    { id: 'alert', username: 'otro', status: 'pending', ip_blocked: true },
    { id: 'old', username: 'cerrada', status: 'rejected', player_user_id: null },
    { id: 'gone', username: 'borrada', status: 'approved', player_user_id: null },
  ]), null);
});

test('sin filas no hay coincidencia', () => {
  assert.equal(pickExistingIpAccount([]), null);
});
