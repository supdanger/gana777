import assert from 'node:assert/strict';
import test from 'node:test';
import { cachedResource, clearResourceCache, readPublicSnapshot, writePublicSnapshot } from '../src/resource-cache.ts';
import { mergeMessages, searchPattern } from '../src/query-utils.ts';

test('la caché comparte peticiones simultáneas y reutiliza el resultado', async () => {
  clearResourceCache();
  let loads = 0;
  const load = async () => { loads++; return { result: 42 }; };
  const [a, b] = await Promise.all([cachedResource('same', 10_000, load), cachedResource('same', 10_000, load)]);
  assert.equal(a, b);
  assert.equal((await cachedResource('same', 10_000, load)), a);
  assert.equal(loads, 1);
});

test('un cambio de cuenta invalida también las respuestas que siguen en vuelo', async () => {
  clearResourceCache();
  let resolveOld;
  const old = cachedResource('private', 10_000, () => new Promise(resolve => { resolveOld = resolve; }));
  await Promise.resolve();
  clearResourceCache();
  await cachedResource('private', 10_000, async () => 'new account');
  resolveOld('old account');
  assert.equal(await old, 'old account');
  assert.equal(await cachedResource('private', 10_000, async () => 'wrong'), 'new account');
});

test('no conserva fallos ni datos vencidos y limita el tamaño en memoria', async () => {
  clearResourceCache();
  await assert.rejects(cachedResource('failure', 10_000, async () => { throw new Error('offline'); }));
  assert.equal(await cachedResource('failure', 10_000, async () => 'retry'), 'retry');
  await cachedResource('expired', -1, async () => 'old');
  assert.equal(await cachedResource('expired', 10_000, async () => 'fresh'), 'fresh');
  for (let i = 0; i < 110; i++) await cachedResource(`row-${i}`, 10_000, async () => i);
  assert.equal(await cachedResource('row-0', 10_000, async () => 'evicted'), 'evicted');
});

test('la persistencia pública tolera datos corruptos, vencidos y almacenamiento bloqueado', () => {
  const items = new Map();
  const storage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) };
  writePublicSnapshot(storage, 'public', { theme: 'modern' });
  assert.deepEqual(readPublicSnapshot(storage, 'public', 60_000), { theme: 'modern' });
  items.set('old', JSON.stringify({ version: 1, savedAt: Date.now() - 120_000, value: {} }));
  assert.equal(readPublicSnapshot(storage, 'old', 60_000), null);
  assert.equal(items.has('old'), false);
  items.set('bad', '{');
  assert.equal(readPublicSnapshot(storage, 'bad', 60_000), null);
  assert.equal(readPublicSnapshot({ getItem() { throw new Error('blocked'); } }, 'public', 1), null);
  assert.doesNotThrow(() => writePublicSnapshot({ setItem() { throw new Error('quota'); } }, 'public', {}));
});

test('fusiona mensajes repetidos y ordena empates de fecha por id', () => {
  const old = [{ id: 'b', created_at: '2026-01-01', body: 'old' }];
  const merged = mergeMessages(old, [{ id: 'a', created_at: '2026-01-01', body: 'first' }, { id: 'b', created_at: '2026-01-01', body: 'updated' }]);
  assert.deepEqual(merged.map(row => row.id), ['a', 'b']);
  assert.equal(merged[1].body, 'updated');
  assert.equal(searchPattern('  @Juan,(user_id.neq.*)  ').includes(','), false);
  assert.ok(!/[(),*%]/.test(searchPattern('x%,other.eq.a')));
});
