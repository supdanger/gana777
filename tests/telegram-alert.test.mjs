import assert from 'node:assert/strict';
import test from 'node:test';
import { bonusPesos, receiptMedia, telegramAlertText } from '../supabase/functions/_shared/telegram-alert.ts';

const deposit = {
  id: 'a', route: 'sac_2', event_type: 'deposit', attempts: 1,
  payload: { request_id: '12345678-aaaa-bbbb-cccc-123456789012', amount: 20000, user_name: 'Max', sac: 2, phone: 7 },
};

test('la carga llega en bloques, con el bono y sin referencia', () => {
  const message = telegramAlertText(deposit, { bonus: bonusPesos(20000, 10, 0) });
  assert.equal(message, [
    'Carga pendiente',
    '',
    'SAC',
    '2',
    '',
    'Teléfono',
    '7',
    '',
    'Usuario',
    'Max',
    '',
    'Monto',
    '$20.000',
    '',
    'Bono',
    '+$2.000',
  ].join('\n'));
  assert.equal(message.includes('Ref'), false);
  assert.equal(bonusPesos(15000, 0, 1000), 1000);
});

test('una carga sin bono o sin comprobante lo dice en el texto', () => {
  const message = telegramAlertText({ ...deposit, payload: { amount: 5000, user_name: 'Ana' } }, { bonus: 0, receiptUnavailable: true });
  assert.match(message, /Bono\nSin bono/);
  assert.match(message, /Comprobante no disponible/);
  assert.equal(message.includes('SAC'), false);
  assert.equal(receiptMedia('pdf')?.field, 'document');
  assert.equal(receiptMedia('jpeg')?.field, 'photo');
});

test('el retiro usa el mismo orden y no incluye referencia', () => {
  const message = telegramAlertText({ id: 'c', route: 'withdrawals', event_type: 'withdrawal', attempts: 1,
    payload: { request_id: '12345678-aaaa-bbbb-cccc-123456789012', amount: 20000, user_name: 'Max' } });
  assert.equal(message, ['Retiro pendiente', '', 'Usuario', 'Max', '', 'Monto', '$20.000'].join('\n'));
});

test('el aviso de cierre informa el operador y los teléfonos del SAC', () => {
  const message = telegramAlertText({ id: 'b', route: 'shifts', event_type: 'shift_end', attempts: 1,
    payload: { operator_name: 'Ana', sac: 3, phones: [4, 9] } });
  assert.equal(message, ['Ana finalizó turno', '', 'SAC', '3', '', 'Teléfonos', '4, 9'].join('\n'));
});
