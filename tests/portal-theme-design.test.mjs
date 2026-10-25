import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultCardStyle, normalizeCardStyle, themeBase, themeSurface } from '../src/portal-theme-design.ts';
import { defaultHomeBanner, homeBannerImage } from '../src/home-banner.ts';

const id = 'custom-00000000-0000-4000-8000-000000000123';

test('un tema creado hereda el estilo y puede tener fondo y tarjetas propios', () => {
  const settings = { portal_theme: id, portal_theme_designs: { [id]: {
    name: 'Carnaval', baseTheme: 'halloween', backgroundPath: 'theme-backgrounds/00000000-0000-4000-8000-000000000124.webp',
    backgroundX: 30, backgroundY: 75, backgroundScale: 120,
    cards: { deposit: { background: '#112233', borderColor: '#abcdef', borderWidth: 3, radius: 20 } },
  } } };
  assert.equal(themeBase(settings), 'halloween');
  const result = themeSurface(settings, path => `https://assets.example/${path}`);
  assert.match(result.className, /theme-halloween/);
  assert.match(result.className, /theme-card-deposit-custom/);
  assert.equal(result.style.backgroundPosition, '30% 75%');
  assert.equal(result.style['--theme-deposit-border'], '#abcdef');
  assert.equal(result.style['--theme-deposit-radius'], '20px');
});

test('el banner de un tema creado usa su imagen o la del tema base', () => {
  const settings = { ...defaultHomeBanner, portal_theme_designs: { [id]: { baseTheme: 'christmas' } } };
  assert.equal(homeBannerImage(settings, id), '/preview-assets/christmas-casino-banner.webp');
  settings.portal_theme_designs[id].casinoPath = 'home-banners/00000000-0000-4000-8000-000000000125.webp';
  assert.equal(homeBannerImage(settings, id), settings.portal_theme_designs[id].casinoPath);
});

test('los colores y bordes guardados se normalizan antes de aplicarse', () => {
  const fallback = defaultCardStyle({ portal_theme: 'base', portal_theme_designs: {} });
  assert.deepEqual(normalizeCardStyle({ background: 'red', borderColor: '#AABBCC', borderWidth: 99, radius: -4 }, fallback), {
    background: fallback.background, borderColor: '#aabbcc', borderWidth: 8, radius: 0,
  });
});
