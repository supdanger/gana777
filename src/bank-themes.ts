import { supabase, type Bank } from './lib';

export type BankThemeKey = 'default' | 'naranja-x' | 'mercado-pago' | 'galicia' | 'uala' | 'lemon' | 'astropay' | 'claro-pay' | 'personal-pay' | 'brubank';
export type BankTheme = {
  key: BankThemeKey;
  name: string;
  className: string;
  accent: string;
  border: string;
  backgroundPosition: string;
  overlay: string;
  defaultBanner?: string;
};

function includedBankTheme(key: BankThemeKey, name: string, accent: string, border: string): BankTheme {
  return {
    key, name, accent, border, className: `theme-${key}`,
    defaultBanner: `/preview-assets/${key}-banner.png`, backgroundPosition: 'center',
    overlay: 'linear-gradient(90deg, rgba(5,18,31,.97), rgba(5,18,31,.72))',
  };
}

export const bankThemeRegistry: Record<BankThemeKey, BankTheme> = {
  default: {
    key: 'default', name: 'GANA777 predeterminado', className: 'theme-default',
    accent: '#48b9fa', border: '#38566e', backgroundPosition: 'center',
    overlay: 'linear-gradient(90deg, rgba(5,20,31,.97), rgba(5,20,31,.82))',
  },
  'naranja-x': {
    defaultBanner: '/preview-assets/naranja-x-banner.png',
    key: 'naranja-x', name: 'Naranja X', className: 'theme-naranja-x',
    accent: '#ff6a27', border: '#86563f', backgroundPosition: 'center',
    overlay: 'linear-gradient(90deg, rgba(5,15,24,.98) 0%, rgba(5,15,24,.9) 52%, rgba(5,15,24,.68) 100%)',
  },
  'mercado-pago': {
    defaultBanner: '/preview-assets/mercado-pago-banner.png',
    key: 'mercado-pago', name: 'Mercado Pago', className: 'theme-mercado-pago',
    accent: '#31b9ff', border: '#326a9a', backgroundPosition: 'center',
    overlay: 'linear-gradient(90deg, rgba(5,18,31,.97) 0%, rgba(5,18,31,.86) 54%, rgba(5,18,31,.64) 100%)',
  },
  galicia: includedBankTheme('galicia', 'Banco Galicia', '#ff813e', '#975138'),
  uala: includedBankTheme('uala', 'Ualá', '#c79bff', '#6953a1'),
  lemon: includedBankTheme('lemon', 'Lemon', '#9ee85c', '#47744c'),
  astropay: includedBankTheme('astropay', 'AstroPay', '#ff8bc5', '#894b80'),
  'claro-pay': includedBankTheme('claro-pay', 'Claro Pay', '#ff8792', '#974751'),
  'personal-pay': includedBankTheme('personal-pay', 'Personal Pay', '#9bafff', '#5a59a1'),
  brubank: includedBankTheme('brubank', 'Brubank', '#c5a4ff', '#7150a4'),
};

export function bankTheme(key: Bank['theme_key']): BankTheme {
  return key && key in bankThemeRegistry ? bankThemeRegistry[key as BankThemeKey] : bankThemeRegistry.default;
}

export function bankAssetUrl(path: string | null | undefined): string | null {
  if (!path || !supabase) return null;
  return supabase.storage.from('app-assets').getPublicUrl(path).data.publicUrl;
}
