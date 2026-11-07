import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { forEachConcurrent } from '../supabase/functions/_shared/concurrency.ts';

test('la caché del worker no intercepta HTML, sesiones, datos ni comprobantes', () => {
  const handlers = new Map();
  vm.runInNewContext(readFileSync(new URL('../src/pwa/sw.js', import.meta.url), 'utf8'), {
    self: { location: { origin: 'https://portal.example' }, addEventListener: (name, handler) => handlers.set(name, handler) }, URL,
  });
  for (const url of ['https://portal.example/', 'https://portal.example/?token=private', 'https://project.supabase.co/rest/v1/requests', 'https://project.supabase.co/storage/v1/object/sign/receipts/a', 'https://portal.example/assets/image.png', 'https://portal.example/assets/bundle-Abc12345.js?token=secret']) {
    handlers.get('fetch')({ request: new Request(url), respondWith() { assert.fail(`No debe interceptar ${url}`); } });
  }
  assert.ok(handlers.has('push'));
  assert.ok(handlers.has('notificationclick'));
});

test('los archivos versionados se reutilizan y el caché elimina excedentes', async () => {
  const handlers = new Map();
  const saved = new Map();
  const tasks = [];
  let fetches = 0;
  const cache = { match: async request => saved.get(request.url)?.clone(), put: async (request, response) => saved.set(request.url, response), keys: async () => [...saved.keys()].map(url => new Request(url)), delete: async request => saved.delete(request.url) };
  const source = readFileSync(new URL('../src/pwa/sw.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, {
    self: { location: { origin: 'https://portal.example' }, addEventListener: (name, handler) => handlers.set(name, handler) }, URL,
    caches: { open: async () => cache },
    fetch: async () => { fetches++; const response = new Response('asset', { headers: { 'content-type': 'text/javascript', 'content-length': '5' } }); Object.defineProperty(response, 'type', { value: 'basic' }); return response; },
  });
  async function request(path) {
    let result;
    handlers.get('fetch')({ request: new Request(`https://portal.example/assets/${path}-Abc12345.js`), respondWith: value => { result = value; }, waitUntil: value => tasks.push(value) });
    const response = await result;
    assert.equal(await response.text(), 'asset');
    await Promise.all(tasks.splice(0));
  }
  await request('first');
  await request('first');
  assert.equal(fetches, 1);
  for (let i = 0; i < 70; i++) await request(`chunk${i}`);
  assert.equal(saved.size, 64);
});

test('los trabajos de push limitan concurrencia y procesan cada elemento una sola vez', async () => {
  let running = 0;
  let peak = 0;
  const seen = [];
  await forEachConcurrent(Array.from({ length: 25 }, (_, i) => i), 5, async item => {
    running++;
    peak = Math.max(peak, running);
    await new Promise(resolve => setTimeout(resolve, 1));
    seen.push(item);
    running--;
  });
  assert.equal(peak, 5);
  assert.deepEqual(seen.sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i));
  await forEachConcurrent([], 5, async () => assert.fail('No hay trabajo'));
});
