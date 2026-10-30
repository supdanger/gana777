import assert from 'node:assert/strict';
import test from 'node:test';
import { canOpenAdminPage, noStaffPermissions, staffPermissionGroups, staffPermissionPages, staffPermissionRoute, staffSignInEmail } from '../src/staff.ts';

test('convierte el usuario del cajero a un correo interno', () => {
  assert.equal(staffSignInEmail('Carlos_1'), 'carlos_1@staff.gana777.internal');
  assert.equal(staffSignInEmail('dueno@example.com'), 'dueno@example.com');
  assert.throws(() => staffSignInEmail('ca'));
});

test('un cajero abre solamente apartados habilitados y el superadmin abre todos', () => {
  const permissions = { ...noStaffPermissions, deposit: true };
  assert.equal(canOpenAdminPage('deposit', permissions, false), true);
  assert.equal(canOpenAdminPage('withdrawal', permissions, false), false);
  assert.equal(canOpenAdminPage('cashiers', permissions, false), false);
  assert.equal(canOpenAdminPage('cashiers', permissions, true), true);
});

test('cada apartado nuevo requiere su propio permiso', () => {
  const routes = [
    ['external_chat', 'external-chat', { chat: true }],
    ['access_requests', 'access-requests', { users: true }],
    ['platform', 'platform', { users: true }],
    ['referrals', 'referrals', { users: true, bonuses: true }],
    ['wheel', 'wheel', { deposit: true, bonuses: true }],
    ['portal', 'portal', { contacts: true }],
    ['announcements', 'announcements', { chat: true }],
    ['themes', 'themes', { portal: true }],
    ['telegram', 'telegram', { contacts: true }],
  ];
  for (const [permission, page, inherited] of routes) {
    assert.equal(staffPermissionRoute[permission], page);
    assert.equal(canOpenAdminPage(page, { ...noStaffPermissions, ...inherited }, false), false);
    assert.equal(canOpenAdminPage(page, { ...noStaffPermissions, [permission]: true }, false), true);
    assert.equal(canOpenAdminPage(page, noStaffPermissions, true), true);
  }
});

test('configuración sensible permanece solo para el superadministrador', () => {
  for (const page of ['cashiers', 'external-chat-admin']) {
    assert.equal(canOpenAdminPage(page, noStaffPermissions, false), false);
    assert.equal(canOpenAdminPage(page, noStaffPermissions, true), true);
  }
});

test('el editor de cajeros muestra cada permiso delegable una sola vez', () => {
  const displayed = staffPermissionGroups.flatMap(group => group.items.map(item => item.key));
  assert.deepEqual([...displayed].sort(), [...staffPermissionPages].sort());
  assert.equal(new Set(displayed).size, displayed.length);
});
