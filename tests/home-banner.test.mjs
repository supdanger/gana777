import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { bannerImageExtension, defaultHomeBanner, homeBannerImage, homeBannerLayout, homeBannerLayoutStyles, homeBannerLink, normalizeHomeBannerLayout, parseHomeBanner } from '../src/home-banner.ts';

test('el panel ofrece el último banner definitivo enviado por el usuario', () => {
  const panel = readFileSync(new URL('../src/portal-admin.tsx', import.meta.url), 'utf8');
  assert.ok(panel.includes("import casinoBanner from './assets/home-casino-banner-v3.png'"));
  const image = readFileSync(new URL('../src/assets/home-casino-banner-v3.png', import.meta.url));
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  assert.equal(image.readUInt32BE(16), 1642);
  assert.equal(image.readUInt32BE(20), 322);
});

test('el banner ocupa el ancho del botón y la vista previa sin franjas vacías', () => {
  for (const [file, selector] of [
    ['reference.css', '.user-app.page-home .home-link-banner img'],
    ['admin.css', '.portal-banner-preview img'],
  ]) {
    const css = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    const rule = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    assert.ok(rule.startsWith(selector));
    assert.ok(rule.includes('width: 100%'));
    assert.ok(rule.includes('height: 100%'));
    assert.ok(rule.includes('object-fit: cover'));
  }
});

test('la imagen visible es el botón, sin borde ni fondo de tarjeta', () => {
  const css = readFileSync(new URL('../src/reference.css', import.meta.url), 'utf8');
  const rule = css.slice(css.indexOf('.user-app.page-home:has(.home-link-banner) .action-card.home-link-banner {')).split('}')[0];
  assert.ok(rule.includes('aspect-ratio: 6 / 1'));
  assert.ok(rule.includes('min-height: 0'));
  assert.ok(css.includes('grid-auto-rows: auto'));
  assert.ok(css.includes('border: 0; border-radius: 7px; background: transparent; box-shadow: none'));
  const adminCss = readFileSync(new URL('../src/admin.css', import.meta.url), 'utf8');
  const preview = adminCss.slice(adminCss.indexOf('.portal-banner-preview {')).split('}')[0];
  assert.ok(preview.includes('aspect-ratio: 6 / 1'));
});

test('el banner permanece oculto hasta habilitarlo con imagen y destino seguro', () => {
  assert.equal(homeBannerLink(defaultHomeBanner), null);
  const path = 'home-banners/00000000-0000-4000-8000-000000000001.png';
  const settings = parseHomeBanner(true, ' Juegos ', ' https://ejemplo.com/jugar?modo=1 ', path);
  assert.equal(settings.home_banner_title, 'Juegos');
  assert.equal(homeBannerLink(settings), 'https://ejemplo.com/jugar?modo=1');
  assert.equal(homeBannerLink(settings, 'https://casino.ejemplo.com/acceso/jugador-1'), 'https://casino.ejemplo.com/acceso/jugador-1');
  assert.equal(homeBannerLink(settings, 'javascript:alert(1)'), 'https://ejemplo.com/jugar?modo=1');
  assert.equal(homeBannerLink({ ...settings, home_banner_enabled: false }), null);
  assert.equal(homeBannerLink({ ...settings, home_banner_path: null }), null);
  assert.equal(homeBannerLink({ ...settings, home_banner_url: 'javascript:alert(1)' }), null);
  assert.throws(() => parseHomeBanner(true, 'Juegos', '', path));
  assert.throws(() => parseHomeBanner(true, 'Juegos', 'https://ejemplo.com', null));
  assert.throws(() => parseHomeBanner(false, '', '', null));
  assert.doesNotThrow(() => parseHomeBanner(false, 'Juegos', '', null));
});

test('cada tema usa su imagen y conserva las imágenes de respaldo', () => {
  const settings = {
    ...defaultHomeBanner,
    home_banner_path: 'home-banners/base.png',
    home_banner_dark_path: 'home-banners/dark.png',
    home_banner_christmas_path: 'home-banners/christmas.png',
  };
  assert.equal(homeBannerImage(settings, 'base'), 'home-banners/base.png');
  assert.equal(homeBannerImage(settings, 'dark'), 'home-banners/dark.png');
  assert.equal(homeBannerImage(settings, 'christmas'), 'home-banners/christmas.png');
  assert.equal(homeBannerImage(settings, 'new-year'), 'home-banners/base.png');
  assert.equal(homeBannerImage({ ...settings, home_banner_christmas_path: null }, 'christmas'), '/preview-assets/christmas-casino-banner.webp');
  assert.equal(homeBannerImage(settings, 'halloween'), '/preview-assets/halloween-casino-banner.webp');
  assert.equal(homeBannerImage({ ...settings, home_banner_halloween_path: 'home-banners/halloween.webp' }, 'halloween'), 'home-banners/halloween.webp');
});

test('el encuadre se guarda por tema y limita valores fuera de rango', () => {
  const settings = { ...defaultHomeBanner, home_banner_layouts: {
    christmas: { height: 22, width: 180, imageHeight: 130, x: 12, y: -8, radius: 24 },
    dark: { height: 999, width: -10, imageHeight: '200', x: Infinity, y: -999, radius: 999 },
  } };
  assert.deepEqual(homeBannerLayout(settings, 'christmas'), { height: 22, width: 180, imageHeight: 130, x: 12, y: -8, radius: 24 });
  assert.deepEqual(homeBannerLayout(settings, 'base'), { height: 16.8, width: 100, imageHeight: 100, x: 0, y: 0, radius: 7 });
  assert.deepEqual(homeBannerLayout(settings, 'dark'), { height: 35, width: 50, imageHeight: 100, x: 0, y: -100, radius: 40 });
  assert.equal(homeBannerLayoutStyles(normalizeHomeBannerLayout(settings.home_banner_layouts.christmas))['--home-banner-image-x'], '12%');
  assert.equal(homeBannerLayoutStyles(homeBannerLayout(settings, 'christmas'))['--home-banner-radius'], '24px');
  assert.deepEqual(homeBannerLayout(settings, 'halloween'), { height: 18, width: 100, imageHeight: 100, x: 0, y: 0, radius: 10 });
});

test('rechaza esquemas inseguros, enlaces con credenciales y textos excesivos', () => {
  for (const url of ['http://ejemplo.com', 'javascript:alert(1)', 'data:text/html,Hola', '//ejemplo.com', 'https://user:password@ejemplo.com', 'https://ejemplo.com/' + 'a'.repeat(2048)]) {
    assert.throws(() => parseHomeBanner(false, 'Juegos', url, null), url);
  }
  assert.throws(() => parseHomeBanner(false, 'a'.repeat(81), '', null));
});

test('la subida comprueba tamaño, MIME y firma de PNG, JPEG y WebP', async () => {
  assert.equal(await bannerImageExtension(new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'banner.png', { type: 'image/png' })), 'png');
  assert.equal(await bannerImageExtension(new File([new Uint8Array([255,216,255])], 'banner.jpg', { type: 'image/jpeg' })), 'jpg');
  assert.equal(await bannerImageExtension(new File(['RIFF1234WEBP'], 'banner.webp', { type: 'image/webp' })), 'webp');
  for (const file of [
    new File(['<svg/>'], 'banner.png', { type: 'image/png' }),
    new File(['<svg/>'], 'banner.svg', { type: 'image/svg+xml' }),
    new File([], 'vacio.png', { type: 'image/png' }),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' }),
  ]) await assert.rejects(bannerImageExtension(file));
});
