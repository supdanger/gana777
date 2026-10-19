import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync(new URL('../src/player-admin.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../supabase/functions/manage-players/index.ts', import.meta.url), 'utf8');

test('el patrón HTML del usuario es válido con la bandera v de los navegadores', () => {
  const literal = panel.match(/pattern=\{('(?:[^'\\]|\\.)*')\}/)?.[1];
  assert.ok(literal);
  // Parse the static JSX string without evaluating source code.
  const pattern = literal.slice(1, -1).replaceAll('\\\\', '\\');
  const regex = new RegExp(`^(?:${pattern})$`, 'v');
  for (const value of ['max', 'max_2', 'max.2', 'max-2']) assert.ok(regex.test(value));
  for (const value of ['max 2', 'max/2', 'max@2']) assert.equal(regex.test(value), false);
});

test('el alta verifica compatibilidad antes de crear y el vínculo después', () => {
  const preflight = panel.indexOf("action: 'referral-capabilities'");
  const create = panel.indexOf("action: 'create'");
  const verify = panel.indexOf(".eq('referred_user_id', created.user_id)");
  assert.ok(preflight > 0 && create > preflight && verify > create);
  assert.ok(server.includes("action === 'referral-capabilities'"));
  assert.ok(server.includes('referral_registered: Boolean(referrerId)'));
});
