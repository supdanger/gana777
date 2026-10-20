import assert from 'node:assert/strict';
import test from 'node:test';
import { canOpenAdminPage, noStaffPermissions, staffSignInEmail } from '../src/staff.ts';

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

test('Recomendados conserva los permisos de Usuarios o Bonos', () => {
  assert.equal(canOpenAdminPage('referrals', noStaffPermissions, false), false);
  assert.equal(canOpenAdminPage('referrals', { ...noStaffPermissions, deposit: true, withdrawal: true }, false), false);
  assert.equal(canOpenAdminPage('referrals', { ...noStaffPermissions, users: true }, false), true);
  assert.equal(canOpenAdminPage('referrals', { ...noStaffPermissions, bonuses: true }, false), true);
  assert.equal(canOpenAdminPage('referrals', noStaffPermissions, true), true);
});

test('solo el superadmin o el permiso Contactos permiten configurar el portal', () => {
  assert.equal(canOpenAdminPage('portal', noStaffPermissions, false), false);
  assert.equal(canOpenAdminPage('portal', { ...noStaffPermissions, users: true, bonuses: true }, false), false);
  assert.equal(canOpenAdminPage('portal', { ...noStaffPermissions, contacts: true }, false), true);
  assert.equal(canOpenAdminPage('portal', noStaffPermissions, true), true);
});
