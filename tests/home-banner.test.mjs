import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { bannerImageExtension, defaultHomeBanner, homeBannerLink, parseHomeBanner } from '../src/home-banner.ts';

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
  assert.equal(homeBannerLink({ ...settings, home_banner_enabled: false }), null);
  assert.equal(homeBannerLink({ ...settings, home_banner_path: null }), null);
  assert.equal(homeBannerLink({ ...settings, home_banner_url: 'javascript:alert(1)' }), null);
  assert.throws(() => parseHomeBanner(true, 'Juegos', '', path));
  assert.throws(() => parseHomeBanner(true, 'Juegos', 'https://ejemplo.com', null));
  assert.throws(() => parseHomeBanner(false, '', '', null));
  assert.doesNotThrow(() => parseHomeBanner(false, 'Juegos', '', null));
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
