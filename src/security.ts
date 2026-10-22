import { InputError } from '../supabase/functions/_shared/validation.ts';

export function safeHttpsLink(value: unknown, hosts?: readonly string[]): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (hosts && !hosts.includes(url.hostname))) return null;
    return url.href;
  } catch { return null; }
}
export function isPublicSupabaseKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true;
  if (key.startsWith('sb_secret_')) return false;
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'anon';
  } catch { return false; }
}
const publicDatabaseMessages = new Set([
  'Ya tenés un retiro pendiente de acreditación.',
  'Debés esperar 24 horas desde la acreditación de tu último retiro.',
  'Solo podés solicitar un retiro cada 24 horas.',
  'Alcanzaste el límite de mensajes. Esperá un minuto.',
  'No hay una cuenta habilitada para recibir cargas.',
  'La asignación de la cuenta venció. Volvé a iniciar la carga.',
  'Estamos realizando el cierre de caja.',
  'Las cargas están temporalmente en mantenimiento.',
  'Seleccioná la cuenta desde la que realizaste la transferencia.',
  'No se pueden confirmar retiros durante el cierre o mantenimiento.',
  'Esta cuenta no está activa en el turno actual.',
  'Esta cuenta sigue en enfriamiento. Elegí otra o esperá a que termine el contador.',
  'Elegí un SAC del 1 al 5.',
  'Escribí el nombre de quien inicia el turno.',
  'Ese SAC ya tiene un turno abierto.',
  'Ese SAC no tiene un turno abierto.',
  'Iniciá el turno de ese SAC antes de elegir teléfonos.',
  'Elegí teléfonos que ya tengan cuentas cargadas.',
  'Un teléfono elegido ya está en otro SAC.',
  'Elegí hasta 20 teléfonos.',
  'El retiro ya no está pendiente.',
  'Este pago ya fue confirmado.',
]);
export function publicError(error: unknown): string {
  if (error instanceof InputError) return error.message;
  if (error && typeof error === 'object' && 'code' in error && 'message' in error
    && error.code === 'P0001' && typeof error.message === 'string' && publicDatabaseMessages.has(error.message)) return error.message;
  return 'No se pudo completar la operación. Verificá los datos e intentá nuevamente.';
}
