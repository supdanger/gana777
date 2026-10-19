import { InputError } from '../supabase/functions/_shared/validation.ts';
import type { Page } from './user-views';

export const staffPermissionPages = ['home', 'deposit', 'withdrawal', 'history', 'users', 'contacts', 'bonuses', 'accounts', 'shifts', 'chat'] as const;
export type StaffPermissionPage = typeof staffPermissionPages[number];
export type StaffPermissions = Record<StaffPermissionPage, boolean>;

export const noStaffPermissions: StaffPermissions = {
  home: false, deposit: false, withdrawal: false, history: false, users: false, contacts: false,
  bonuses: false, accounts: false, shifts: false, chat: false,
};
export const allStaffPermissions: StaffPermissions = Object.fromEntries(staffPermissionPages.map(page => [page, true])) as StaffPermissions;

export function isStaffPermissionPage(page: Page): page is StaffPermissionPage {
  return (staffPermissionPages as readonly string[]).includes(page);
}

export function canOpenAdminPage(page: Page, permissions: StaffPermissions, superAdmin: boolean): boolean {
  if (page === 'referrals') return superAdmin || permissions.users || permissions.bonuses;
  return superAdmin || (isStaffPermissionPage(page) && permissions[page]);
}

export function staffSignInEmail(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') throw new InputError('Ingresá tu usuario.');
  const identifier = value.trim().toLowerCase();
  if (identifier.includes('@')) {
    if (identifier.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) throw new InputError('Ingresá un correo válido.');
    return identifier;
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(identifier)) throw new InputError('El usuario debe tener entre 3 y 32 caracteres y usar letras, números, punto, guion o guion bajo.');
  return `${identifier}@staff.gana777.internal`;
}
