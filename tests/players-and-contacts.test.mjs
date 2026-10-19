import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playerSignInEmail } from '../src/players.ts';

const migration = readFileSync(new URL('../supabase/migrations/017_players_and_contacts.sql', import.meta.url), 'utf8');
const directorySecurity = readFileSync(new URL('../supabase/migrations/018_player_directory_security.sql', import.meta.url), 'utf8');
const manager = readFileSync(new URL('../supabase/functions/manage-players/index.ts', import.meta.url), 'utf8');

test('players can sign in with a short username while legacy emails still work', () => {
  assert.equal(playerSignInEmail(' Juanito '), 'juanito@players.gana777.internal');
  assert.equal(playerSignInEmail('persona@example.com'), 'persona@example.com');
  for (const value of ['ab', 'usuario con espacios', 'usuario@incompleto', null]) {
    assert.throws(() => playerSignInEmail(value));
  }
});

test('player phones are globally unique and WhatsApp principal slots stop at 50', () => {
  assert.match(migration, /create table if not exists public\.whatsapp_principals/);
  assert.match(migration, /slot smallint primary key check \(slot between 1 and 50\)/);
  assert.match(migration, /create unique index if not exists player_phone_unique on public\.user_profiles\(phone\)/);
  assert.match(migration, /phone text not null unique check/);
  assert.match(migration, /whatsapp_principal_slot smallint references public\.whatsapp_principals\(slot\)/);
});

test('the contacts migration safely reconciles an existing principals table', () => {
  assert.match(migration, /drop policy if exists whatsapp_principals_read/);
  assert.match(migration, /drop policy if exists whatsapp_principals_insert/);
  assert.match(migration, /drop policy if exists whatsapp_principals_update/);
  assert.match(migration, /drop policy if exists whatsapp_principals_delete/);
});

test('assigned player WhatsApp is private and respects channel visibility', () => {
  const rpc = migration.slice(migration.indexOf('create or replace function public.get_my_whatsapp_url'));
  assert.match(rpc, /p\.user_id=auth\.uid\(\)/);
  assert.match(rpc, /s\.show_whatsapp and w\.active/);
  assert.match(migration, /revoke all on function public\.get_my_whatsapp_url\(\) from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.get_my_whatsapp_url\(\) to authenticated/);
});

test('player account management requires the users permission and validates phones', () => {
  assert.match(manager, /has_admin_permission.*permission_name: 'users'/s);
  assert.match(manager, /\^\[1-9\]\[0-9\]\{7,14\}\$/);
  assert.match(manager, /Ese número de teléfono ya pertenece a otro jugador/);
  assert.match(manager, /server\.auth\.admin\.updateUserById\(userId, \{ password \}\)/);
});

test('the player directory excludes panel accounts without exposing admin_users', () => {
  assert.match(directorySecurity, /function public\.is_panel_user\(target_user_id uuid\)/);
  assert.match(directorySecurity, /security definer set search_path = ''/);
  assert.match(directorySecurity, /revoke all on function public\.is_panel_user\(uuid\) from public,anon,authenticated/);
  assert.match(directorySecurity, /where not public\.is_panel_user\(p\.user_id\)/);
  assert.match(directorySecurity, /security_invoker = true/);
});
