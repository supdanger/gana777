import { InputError } from '../supabase/functions/_shared/validation.ts';

export function playerSignInEmail(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') throw new InputError('Ingresá tu usuario.');
  const identifier = value.trim().toLowerCase();
  if (identifier.includes('@')) {
    if (identifier.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) throw new InputError('Ingresá un usuario o correo válido.');
    return identifier;
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(identifier)) throw new InputError('El usuario debe tener entre 3 y 32 caracteres y usar letras, números, punto, guion o guion bajo.');
  return `${identifier}@players.gana777.internal`;
}
