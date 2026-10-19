import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/013_strict_cash_close.sql', import.meta.url), 'utf8');

test('cash close and maintenance expire every pending bank reservation', () => {
  const expirations = migration.match(/update public\.bank_account_assignments set status = 'expired' where status = 'reserved'/g) ?? [];
  assert.equal(expirations.length, 2);
});

test('assignment checks the operating mode before returning a reservation', () => {
  const assignment = migration.slice(migration.indexOf('create or replace function public.assign_bank_account'));
  assert.ok(assignment.indexOf("if current_mode = 'closing'") < assignment.indexOf('select a.id into existing_assignment'));
  assert.match(migration, /alter publication supabase_realtime add table public\.bank_operation_state/);
});
