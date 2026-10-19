import { Copy } from 'lucide-react';
import type { CSSProperties } from 'react';
import { bankAssetUrl, bankTheme } from './bank-themes';
import type { Bank } from './lib';

type ThemeStyle = CSSProperties & {
  '--bank-accent': string;
  '--bank-border': string;
  '--bank-overlay': string;
  '--bank-background-position': string;
};

export function BankTransferCard({ bank, onCopy }: { bank: Bank; onCopy: (text: string, label: string) => void }) {
  const theme = bankTheme(bank.theme_key);
  const background = bankAssetUrl(bank.theme_background_path);
  const logo = bankAssetUrl(bank.theme_logo_path);
  const hasBankArt = !!background;
  const style: ThemeStyle = {
    '--bank-accent': theme.accent,
    '--bank-border': theme.border,
    '--bank-overlay': theme.overlay,
    '--bank-background-position': theme.backgroundPosition,
  };
  const copyButton = (value: string, label: string) => <button type="button" onClick={() => onCopy(value, label)} aria-label={`Copiar ${label}`}><Copy size={16} /><span>Copiar</span></button>;

  return <section className={`bank-transfer-card ${theme.className}${theme.defaultBanner ? ' branded-bank-banner' : ''}${hasBankArt ? ' has-bank-art' : ''}`} data-bank-theme={theme.key} style={style} aria-label={`Datos para transferir a ${bank.bank}`}>
    <div className="bank-theme-art" aria-hidden="true" style={background ? { backgroundImage: `url(${JSON.stringify(background).slice(1, -1)})` } : undefined} />
    <div className="bank-theme-overlay" aria-hidden="true" />
    <div className="bank-transfer-content">
      {theme.defaultBanner && hasBankArt && <small className="bank-art-subtitle">Datos para transferir</small>}
      <header className="bank-transfer-heading">
        <div><strong>{bank.bank}</strong><small>Datos para transferir</small></div>
        {logo && <img src={logo} alt="" />}
      </header>
      <dl className="bank-transfer-data">
        <div><dt>Titular</dt><dd>{bank.holder}</dd></div>
        <div><dt>CBU</dt><dd><span>{bank.cbu}</span>{copyButton(bank.cbu, 'CBU')}</dd></div>
        {bank.alias && <div><dt>Alias</dt><dd><span>{bank.alias}</span>{copyButton(bank.alias, 'alias')}</dd></div>}
      </dl>
    </div>
  </section>;
}
