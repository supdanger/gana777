import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { portalPwaPlugin } from '../scripts/portal-pwa.mjs';

test('el build predeterminado de Vite también publica una app instalable', () => {
  for (const mode of ['production', 'development', 'user', 'staging']) {
    const plugin = portalPwaPlugin(mode);
    assert.ok(plugin, `El portal en modo ${mode} necesita los archivos PWA`);
    assert.ok(plugin.transformIndexHtml().some(tag => tag.attrs.rel === 'manifest'));
    const assets = [];
    plugin.generateBundle.call({ emitFile: asset => assets.push(asset.fileName) });
    assert.ok(assets.includes('pwa/manifest.webmanifest'));
    assert.ok(assets.includes('pwa/icon-panda-192.png'));
    assert.ok(assets.includes('pwa/icon-panda-512.png'));
    assert.ok(assets.includes('pwa/icon-panda-maskable-512.png'));
    assert.ok(assets.includes('sw.js'));
  }
  assert.equal(portalPwaPlugin('admin'), null);
});

test('solo el portal incluye manifiesto y metadatos de instalación', () => {
  assert.equal(portalPwaPlugin('admin'), null);
  const plugin = portalPwaPlugin('user');
  const tags = plugin.transformIndexHtml();
  assert.ok(tags.some(tag => tag.attrs.rel === 'manifest' && tag.attrs.href === '/pwa/manifest.webmanifest'));
  assert.ok(tags.some(tag => tag.attrs.rel === 'apple-touch-icon'));
  const assets = [];
  plugin.generateBundle.call({ emitFile: asset => assets.push(asset) });
  assert.equal(assets.length, 7);
  const manifest = JSON.parse(assets.find(asset => asset.fileName.endsWith('.webmanifest')).source.toString());
  assert.equal(manifest.name, 'GANA777');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  for (const size of [192, 512, 1024]) {
    const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}` && icon.purpose === 'any');
    assert.ok(icon);
    const png = assets.find(asset => `/${asset.fileName}` === icon.src).source;
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  const maskable = manifest.icons.find(icon => icon.purpose === 'maskable');
  assert.equal(maskable.sizes, '512x512');
  assert.ok(assets.some(asset => `/${asset.fileName}` === maskable.src));
  const apple = assets.find(asset => asset.fileName.endsWith('apple-touch-icon-panda.png')).source;
  assert.equal(apple.readUInt32BE(16), 180);
  assert.equal(apple.readUInt32BE(20), 180);
});

test('el servidor de desarrollo sirve los archivos PWA con su tipo correcto', () => {
  let middleware;
  portalPwaPlugin('user').configureServer({ middlewares: { use: handler => { middleware = handler; } } });
  let type;
  let body;
  middleware({ url: '/pwa/manifest.webmanifest?v=1' }, {
    setHeader: (name, value) => { assert.equal(name, 'Content-Type'); type = value; },
    end: value => { body = value; },
  }, () => assert.fail('No debe pasar al fallback HTML'));
  assert.equal(type, 'application/manifest+json');
  assert.equal(JSON.parse(body.toString()).name, 'GANA777');
  let next = false;
  middleware({ url: '/otra-ruta' }, {}, () => { next = true; });
  assert.equal(next, true);
});

test('la instalación usa el navegador y no agrega caché de datos financieros', () => {
  const source = readFileSync(new URL('../src/portal-install.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes("if (!adminApp)"));
  assert.ok(source.includes("if (adminApp || hidden) return null"));
  assert.ok(source.includes("'beforeinstallprompt'"));
  assert.ok(source.includes("'appinstalled'"));
  assert.ok(source.includes('await prompt.prompt()'));
  assert.equal(source.includes('serviceWorker.register'), false);
  assert.equal(source.includes('caches.open'), false);
});
