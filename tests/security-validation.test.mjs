import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFormFields, InputError, parseAlias, parseAmount, parseBank, parseBonusPercent, parseBonusRule, parseBonusTitle, parseCbu, parseEmail, parseHolder, parseMessage, parseUuid } from '../supabase/functions/_shared/validation.ts';
import { isPublicSupabaseKey, publicError, safeHttpsLink } from '../src/security.ts';

test('bonus names and percentages stay within the promotion limits', () => {
  assert.equal(parseBonusTitle('  Recarga 10% '), 'Recarga 10%');
  assert.equal(parseBonusPercent('10,5'), 10.5);
  assert.throws(() => parseBonusTitle('A'), InputError);
  assert.throws(() => parseBonusPercent('0'), InputError);
  assert.throws(() => parseBonusPercent('101'), InputError);
  const percent = new FormData();
  percent.set('title', 'Recarga');
  percent.set('mode', 'percent');
  percent.set('value', '10');
  percent.set('min_amount', '10000');
  percent.set('max_amount', '50000');
  assert.deepEqual(parseBonusRule(percent), { title: 'Recarga', bonus_mode: 'percent', bonus_percent: 10, bonus_amount: 0, min_amount: 10000, max_amount: 50000 });
  const fixed = new FormData();
  fixed.set('title', 'Extra');
  fixed.set('mode', 'fixed');
  fixed.set('value', '5000');
  fixed.set('min_amount', '20000');
  fixed.set('max_amount', '20000');
  assert.deepEqual(parseBonusRule(fixed), { title: 'Extra', bonus_mode: 'fixed', bonus_percent: 0, bonus_amount: 5000, min_amount: 20000, max_amount: 20000 });
  fixed.set('max_amount', '1000');
  assert.throws(() => parseBonusRule(fixed), InputError);
  fixed.set('max_amount', '80000');
  fixed.set('mode', 'otro');
  assert.throws(() => parseBonusRule(fixed), InputError);
});
test('receiving bank names stay short and literal', () => {
  assert.equal(parseBank('  Mercado Pago '), 'Mercado Pago');
  assert.equal(parseBank('Banco Nación'), 'Banco Nación');
  for (const value of ['A', '<script>', 'Banco\nGalicia', 'x'.repeat(81)]) assert.throws(() => parseBank(value), InputError);
});
test('names preserve accents, hyphens and legitimate apostrophes', () => {
  assert.equal(parseHolder("  María  O'Neill  "), "María O'Neill");
  assert.equal(parseHolder('Jose\u0301 Pérez'), 'José Pérez');
  assert.equal(parseHolder('Ana-María D’Angelo'), 'Ana-María D’Angelo');
});
test('bank holder rejects markup, control characters and non-name payloads', () => {
  for (const value of ["Robert'); DROP TABLE users;--", '<script>alert(1)</script>', 'Juan\nPérez', 'Juan\u200bPérez', 'Juan123', 'A', {}, 'a'.repeat(121)]) assert.throws(() => parseHolder(value), InputError);
});
test('alias accepts only supported ASCII characters and lengths', () => {
  assert.equal(parseAlias('  cuenta.ejemplo-1 '), 'cuenta.ejemplo-1');
  assert.equal(parseAlias(''), null);
  for (const value of ['abc', 'a'.repeat(21), 'alias_123', "' OR 1=1 --", 'cuenta ejemplo', 'cuenta\nabc', 'cuenta.ñandú']) assert.throws(() => parseAlias(value), InputError);
});
test('CBU/CVU accepts visual separators and normalizes to exactly 22 ASCII digits', () => {
  assert.equal(parseCbu('0123456789012345678901'), '0123456789012345678901');
  assert.equal(parseCbu('01234567.89012345678901'), '0123456789012345678901');
  assert.equal(parseCbu('0123 4567 8901 2345 6789 01'), '0123456789012345678901');
  assert.equal(parseCbu('01234567-89012345678901'), '0123456789012345678901');
  for (const value of ['1'.repeat(21), '1'.repeat(23), '1'.repeat(21)+'a', '１'.repeat(22), '0 OR 1=1', null, 123]) assert.throws(() => parseCbu(value), InputError);
});
test('monetary and UUID inputs cannot smuggle query syntax', () => {
  for (const value of ["1;DROP TABLE requests", '1/**/OR/**/1=1', '1'.repeat(30), {}, null, Infinity]) assert.throws(() => parseAmount(value), InputError);
  assert.equal(parseAmount('10.000'), 10000);
  assert.equal(parseUuid('00000000-0000-4000-8000-000000000777'), '00000000-0000-4000-8000-000000000777');
  for (const value of ['1 OR 1=1', 'id.eq.a,user_id.neq.b', null, ['00000000-0000-4000-8000-000000000777']]) assert.throws(() => parseUuid(value), InputError);
});
test('chat remains literal text, including quotes and SQL-looking phrases', () => {
  const message = "O'Neill preguntó: SELECT * FROM requests; <script>alert(1)</script>";
  assert.equal(parseMessage(message), message);
  for (const value of [' ', 'x'.repeat(2001), 'hola\u0000', 'hola\u202e', {}]) assert.throws(() => parseMessage(value), InputError);
});
test('rejects unexpected and repeated form fields', () => {
  const good = new FormData(); good.set('amount','10'); assert.doesNotThrow(() => assertFormFields(good,['amount']));
  const forged = new FormData(); forged.set('amount','10'); forged.set('status','approved');
  assert.throws(() => assertFormFields(forged,['amount']), InputError);
  const repeated = new FormData(); repeated.append('amount','10'); repeated.append('amount','100000');
  assert.throws(() => assertFormFields(repeated,['amount']), InputError);
});
test('email rejects controls and excessive size without changing passwords', () => {
  assert.equal(parseEmail(' gana777@gmail.com '), 'gana777@gmail.com');
  for (const value of ['a\n@example.com','<script>@example.com','a'.repeat(255)+'@example.com',null]) assert.throws(() => parseEmail(value), InputError);
});
test('contact links cannot use script URLs or misleading host names', () => {
  assert.equal(safeHttpsLink('https://wa.me/5491112345678',['wa.me']), 'https://wa.me/5491112345678');
  for (const value of ['javascript:alert(1)','data:text/html,test','http://wa.me/1','https://wa.me.evil.example/1','https://wa.me@evil.example/1','https://user:password@wa.me/1']) assert.equal(safeHttpsLink(value,['wa.me']),null);
});
test('database errors and server details are not shown in the UI', () => {
  assert.equal(publicError(new InputError('El CBU no es válido.')), 'El CBU no es válido.');
  const secret = 'private_table secret_key';
  assert.ok(!publicError(new Error(secret)).includes(secret));
  assert.ok(!publicError({code:'42P01',message:secret,details:secret}).includes(secret));
  assert.ok(!publicError({code:'P0001',message:secret}).includes(secret));
  assert.equal(publicError({code:'P0001',message:'Solo podés solicitar un retiro cada 24 horas.'}), 'Solo podés solicitar un retiro cada 24 horas.');
});
test('browser client refuses service_role and secret API keys', () => {
  const jwt = role => 'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.test-signature';
  assert.equal(isPublicSupabaseKey('sb_publishable_example'),true);
  assert.equal(isPublicSupabaseKey(jwt('anon')),true);
  assert.equal(isPublicSupabaseKey(jwt('service_role')),false);
  assert.equal(isPublicSupabaseKey('sb_secret_example'),false);
  assert.equal(isPublicSupabaseKey('invalid'),false);
});
