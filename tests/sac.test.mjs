import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputError } from '../supabase/functions/_shared/validation.ts';
import {
  depositRouteLabel, formatPhoneList, groupAccountsByPhone, mergePhoneOptions, parseOperatorName, parsePhoneNumber,
  parseSacStation, phonesFromAccounts, readSacBoard, sacShiftMessage, scopedDepositFilter, stationsOrDefaults, telegramShiftSentence,
} from '../src/sac.ts';

test('formats the telegram shift messages', () => {
  assert.equal(sacShiftMessage('start', 'Max', 1), 'Max inició turno · SAC 1 · Gana777');
  assert.equal(sacShiftMessage('end', 'Max', 1, [7, 1, 4, 1]), 'Max finalizó turno · SAC 1 · Gana777 · Teléfonos 1, 4 y 7');
  assert.equal(sacShiftMessage('end', 'Max', 2, []), 'Max finalizó turno · SAC 2 · Gana777 · Sin teléfonos');
  assert.equal(formatPhoneList([2]), '2');
});

test('accepts an operator name and a phone from 1 to 30', () => {
  assert.equal(parseOperatorName('  Max  '), 'Max');
  assert.equal(parseOperatorName('Ana María'), 'Ana María');
  assert.equal(parsePhoneNumber('01'), 1);
  assert.equal(parseSacStation('5'), 5);
  assert.equal(parseSacStation('6'), null);
  assert.throws(() => parseOperatorName(''), InputError);
  assert.throws(() => parsePhoneNumber('31'), InputError);
});

test('groups accounts by phone and keeps the unassigned ones first', () => {
  const groups = groupAccountsByPhone([
    { holder: 'Bazan', phone_number: 2 },
    { holder: 'Muñoz', phone_number: 1 },
    { holder: 'Pérez', phone_number: 1 },
    { holder: 'Sosa', phone_number: null },
  ]);
  assert.deepEqual(groups.map(group => [group.phone, group.items.map(item => item.holder)]), [
    [null, ['Sosa']],
    [1, ['Muñoz', 'Pérez']],
    [2, ['Bazan']],
  ]);
});

test('shows a cashier only the loads of the SAC saved on this computer', () => {
  assert.equal(scopedDepositFilter(true, 2), 'all');
  assert.equal(scopedDepositFilter(false, 2), 2);
  assert.equal(scopedDepositFilter(false, null), 'none');
  assert.equal(depositRouteLabel({ kind: 'deposit', deposit_sac: 2, deposit_phone: 4, deposit_holder: 'Bazan' }, false), 'Teléfono 4 · Bazan');
  assert.equal(depositRouteLabel({ kind: 'deposit', deposit_sac: null, deposit_phone: null, deposit_holder: null }, true), 'Sin SAC');
  assert.equal(depositRouteLabel({ kind: 'deposit' }, true), '');
  assert.equal(depositRouteLabel({ kind: 'withdrawal', deposit_sac: 1 }, true), '');
});

test('keeps the shift open when telegram is not configured yet', () => {
  assert.match(telegramShiftSentence('iniciado', { delivered: false, reason: 'missing_config' }, false), /TELEGRAM_BOT_TOKEN/);
  assert.match(telegramShiftSentence('finalizado', { delivered: true }, false), /salió por Telegram/);
  assert.match(telegramShiftSentence('iniciado', null, true), /desplegá notify-sac-shift/);
});

test('reads the sac board returned by the database', () => {
  const board = readSacBoard({
    active_shift: 'morning',
    stations: [{ number: 1, operator_name: 'Max', started_at: '2026-10-22T12:00:00Z', phones: [1, 4] }, { number: 9 }],
    phones: [{ phone: '2', holders: ['Bazan'], active_count: '1', on_shift: true }],
  });
  assert.equal(board.active_shift, 'morning');
  assert.deepEqual(stationsOrDefaults(board.stations).map(station => station.number), [1, 2, 3, 4, 5]);
  assert.deepEqual(board.stations[0], { number: 1, operator_name: 'Max', started_at: '2026-10-22T12:00:00Z', phones: [1, 4] });
  assert.deepEqual(board.phones, [{ phone: 2, holders: ['Bazan'], active_count: 1, on_shift: true }]);
  const encoded = readSacBoard(JSON.stringify({ active_shift: 'night', stations: [], phones: [{ phone: 4, holders: ['Bazan'], active_count: 2 }] }));
  assert.equal(encoded.active_shift, 'night');
  assert.deepEqual(encoded.phones, [{ phone: 4, holders: ['Bazan'], active_count: 2 }]);
});

test('lists every numbered phone, including accounts from another cash shift', () => {
  const phones = phonesFromAccounts([
    { phone_number: 1, holder: 'Muñoz', active: true, shift_key: 'morning' },
    { phone_number: 1, holder: 'Pérez', active: false, shift_key: 'morning' },
    { phone_number: '4', holder: 'Bazan', active: true, shift_key: 'night' },
    { phone_number: 2, holder: 'Día', active: true, shift_key: 'morning' },
    { phone_number: 2, holder: 'Noche', active: true, shift_key: 'night' },
    { phone_number: null, holder: 'Sosa', active: true, shift_key: 'morning' },
    { phone_number: 99, holder: 'Fuera', active: true, shift_key: 'morning' },
  ], 'morning');
  assert.deepEqual(phones, [
    { phone: 1, holders: ['Muñoz', 'Pérez'], active_count: 1, on_shift: true },
    { phone: 2, holders: ['Día'], active_count: 1, on_shift: true },
    { phone: 4, holders: ['Bazan'], active_count: 0, on_shift: false },
  ]);
  assert.deepEqual(mergePhoneOptions(
    [{ phone: 4, holders: ['Bazan'], active_count: 0, on_shift: false }],
    [{ phone: 1, holders: ['Muñoz'], active_count: 1 }, { phone: 4, holders: ['Viejo'], active_count: 1 }],
  ), [
    { phone: 1, holders: ['Muñoz'], active_count: 1 },
    { phone: 4, holders: ['Bazan'], active_count: 0, on_shift: false },
  ]);
});
