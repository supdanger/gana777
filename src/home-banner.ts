import { InputError } from '../supabase/functions/_shared/validation.ts';
import { safeHttpsLink } from './security.ts';

export type HomeBannerSettings = {
  home_banner_enabled: boolean;
  home_banner_title: string;
  home_banner_url: string | null;
  home_banner_path: string | null;
};
export const defaultHomeBanner: HomeBannerSettings = {
  home_banner_enabled: false, home_banner_title: 'Visitar página', home_banner_url: null, home_banner_path: null,
};
export const homeBannerColumns = 'home_banner_enabled,home_banner_title,home_banner_url,home_banner_path,allow_player_logout';

export function homeBannerLink(settings: HomeBannerSettings, personalUrl?: string | null): string | null {
  return settings.home_banner_enabled && settings.home_banner_path ? safeHttpsLink(personalUrl) ?? safeHttpsLink(settings.home_banner_url) : null;
}

export function parseHomeBanner(enabled: boolean, title: string, url: string, path: string | null): HomeBannerSettings {
  const label = title.trim();
  if (!label || label.length > 80) throw new InputError('Ingresá un nombre de entre 1 y 80 caracteres para el botón.');
  const link = url.trim() ? safeHttpsLink(url.trim()) : null;
  if (url.trim() && !link) throw new InputError('Ingresá una dirección HTTPS válida, sin usuario ni contraseña.');
  if (enabled && (!link || !path)) throw new InputError('Para mostrar el botón, cargá una imagen y un enlace de destino.');
  return { home_banner_enabled: enabled, home_banner_title: label, home_banner_url: link, home_banner_path: path };
}

export async function bannerImageExtension(file: File): Promise<string> {
  if (!file.size || file.size > 5 * 1024 * 1024) throw new InputError('La imagen debe pesar hasta 5 MB.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === 'image/png' && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return 'png';
  if (file.type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (file.type === 'image/webp' && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'webp';
  throw new InputError('Elegí una imagen JPG, PNG o WebP válida.');
}
