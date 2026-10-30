import { InputError } from '../supabase/functions/_shared/validation.ts';
import type { Page } from './user-views';

export const staffPermissionPages = [
  'home', 'deposit', 'withdrawal', 'chat', 'external_chat', 'announcements', 'access_requests', 'users',
  'platform', 'shifts', 'referrals', 'wheel', 'history', 'contacts', 'portal', 'themes', 'bonuses', 'accounts', 'telegram',
] as const;
export type StaffPermissionPage = typeof staffPermissionPages[number];
export type StaffPermissions = Record<StaffPermissionPage, boolean>;

export const staffPermissionGroups: { label: string; items: { key: StaffPermissionPage; label: string; description: string }[] }[] = [
  { label: 'Principal', items: [
    { key: 'home', label: 'Inicio', description: 'Resumen y contadores del turno' },
  ] },
  { label: 'Operaciones', items: [
    { key: 'deposit', label: 'Cargas', description: 'Revisar y aprobar cargas' },
    { key: 'withdrawal', label: 'Retiros', description: 'Revisar y pagar retiros' },
    { key: 'chat', label: 'Chat de jugadores', description: 'Responder dentro de la app' },
    { key: 'external_chat', label: 'Chat externo', description: 'Responder desde gana777bet.com' },
    { key: 'announcements', label: 'Mensajes', description: 'Crear avisos programados para jugadores' },
    { key: 'access_requests', label: 'Solicitudes', description: 'Crear accesos solicitados' },
    { key: 'users', label: 'Jugadores', description: 'Crear y administrar jugadores' },
    { key: 'platform', label: 'Platform', description: 'Cuentas de la plataforma' },
    { key: 'shifts', label: 'Turnos', description: 'Abrir y cerrar turnos' },
    { key: 'referrals', label: 'Recomendados', description: 'Revisar premios de referidos' },
    { key: 'wheel', label: 'Ruleta', description: 'Giros, premios y activación' },
    { key: 'history', label: 'Historial', description: 'Consultar movimientos' },
  ] },
  { label: 'Configuración', items: [
    { key: 'contacts', label: 'Contactos', description: 'WhatsApp y principales' },
    { key: 'portal', label: 'Portal', description: 'Banner y logo de inicio' },
    { key: 'themes', label: 'Temas', description: 'Diseños y banners por tema' },
    { key: 'bonuses', label: 'Bonos', description: 'Crear y editar bonos' },
    { key: 'accounts', label: 'Cuentas', description: 'Cuentas bancarias' },
    { key: 'telegram', label: 'Telegram', description: 'Grupos y alertas internas' },
  ] },
];

export const staffPermissionRoute: Record<StaffPermissionPage, Page> = {
  home: 'home', deposit: 'deposit', withdrawal: 'withdrawal', chat: 'chat', external_chat: 'external-chat', announcements: 'announcements',
  access_requests: 'access-requests', users: 'users', platform: 'platform', shifts: 'shifts',
  referrals: 'referrals', wheel: 'wheel', history: 'history', contacts: 'contacts', portal: 'portal',
  themes: 'themes', bonuses: 'bonuses', accounts: 'accounts', telegram: 'telegram',
};

export const noStaffPermissions: StaffPermissions = {
  home: false, deposit: false, withdrawal: false, chat: false, external_chat: false, announcements: false,
  access_requests: false, users: false, platform: false, shifts: false, referrals: false,
  wheel: false, history: false, contacts: false, portal: false, themes: false, bonuses: false, accounts: false, telegram: false,
};
export const allStaffPermissions: StaffPermissions = Object.fromEntries(staffPermissionPages.map(page => [page, true])) as StaffPermissions;

export function isStaffPermissionPage(page: Page): page is Extract<Page, StaffPermissionPage> {
  return (staffPermissionPages as readonly string[]).includes(page);
}

export function canOpenAdminPage(page: Page, permissions: StaffPermissions, superAdmin: boolean): boolean {
  if (page === 'external-chat') return superAdmin || permissions.external_chat;
  if (page === 'external-chat-admin') return superAdmin;
  if (page === 'portal') return superAdmin || permissions.portal;
  if (page === 'access-requests') return superAdmin || permissions.access_requests;
  if (page === 'platform') return superAdmin || permissions.platform;
  if (page === 'referrals') return superAdmin || permissions.referrals;
  if (page === 'wheel') return superAdmin || permissions.wheel;
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
