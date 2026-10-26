import assert from 'node:assert/strict';
import test from 'node:test';
import { telegramAlertText } from '../supabase/functions/_shared/telegram-alert.ts';

test('los avisos internos identifican la operación y el SAC sin incluir datos bancarios', () => {
  const message = telegramAlertText({ id: 'a', route: 'sac_2', event_type: 'deposit', attempts: 1,
    payload: { request_id: '12345678-aaaa-bbbb-cccc-123456789012', amount: 20000, user_name: 'Max', sac: 2, phone: 7 } });
  assert.match(message, /Carga pendiente · SAC 2 · Teléfono 7/);
  assert.match(message, /Max · \$20\.000/);
  assert.match(message, /Ref\. 12345678/);
});

test('el aviso de cierre informa el operador y los teléfonos del SAC', () => {
  const message = telegramAlertText({ id: 'b', route: 'shifts', event_type: 'shift_end', attempts: 1,
    payload: { operator_name: 'Ana', sac: 3, phones: [4, 9] } });
  assert.equal(message, '🕒 Ana finalizó turno · SAC 3 · Teléfonos 4, 9');
});
