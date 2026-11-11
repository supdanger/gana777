import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { mergeMessages, searchPattern, searchFilter } from '../src/query-utils.ts';

function client(respond) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, filters: [], orders: [] };
      calls.push(call);
      const query = {
        select(columns, options) { call.columns = columns; call.options = options; return query; },
        eq(column, value) { call.filters.push(['eq', column, value]); return query; },
        neq(column, value) { call.filters.push(['neq', column, value]); return query; },
        in(column, value) { call.filters.push(['in', column, value]); return query; },
        or(value) { call.or = value; return query; },
        order(column, options) { call.orders.push([column, options]); return query; },
        range(from, to) { call.range = [from, to]; return query; },
        limit(value) { call.limit = value; return query; },
        abortSignal(value) { call.signal = value; return query; },
        single() { return query; },
        remove(paths) { call.paths = paths; return query; },
        then(resolve, reject) { return Promise.resolve().then(() => respond(call)).then(resolve, reject); },
      };
      return query;
    },
  };
}

function moduleWith(file, dependencies) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; }, Map, Set });
  return exports;
}

test('pagina en servidor y conserva el alcance del usuario en el fallback de columnas', async () => {
  const db = client(call => call.columns === 'new' ? { error: { message: 'bonus_amount missing' } } : { data: [{ id: 'r', bonus_amount: null }], count: 71 });
  const { readRequestPage } = moduleWith('request-data.ts', { './lib': { supabase: db, REQUEST_COLUMNS: 'new', REQUEST_COLUMNS_LEGACY: 'legacy' } });
  const result = await readRequestPage({ userId: 'player', kind: 'withdrawal', status: 'pending', size: 10, page: 2 });
  assert.equal(result.total, 71);
  assert.equal(result.rows[0].bonus_amount, 0);
  assert.equal(db.calls.length, 2);
  for (const call of db.calls) {
    assert.deepEqual(call.range, [20, 29]);
    assert.ok(call.filters.some(([type, field, value]) => type === 'eq' && field === 'user_id' && value === 'player'));
    assert.ok(call.filters.some(([type, field, value]) => type === 'eq' && field === 'status' && value === 'pending'));
    assert.equal(call.orders.at(-1)[0], 'id');
  }
});

test('las partes se consultan por ids visibles en lotes que no exceden el límite de respuesta', async () => {
  const db = client(() => ({ data: [{ request_id: 'r', part_number: 1 }] }));
  const { readWithdrawalParts } = moduleWith('request-data.ts', { './lib': { supabase: db } });
  const ids = Array.from({ length: 12 }, (_, i) => `r${i}`);
  assert.equal((await readWithdrawalParts(ids)).length, 3);
  assert.equal(db.calls.length, 3);
  assert.deepEqual(db.calls.flatMap(call => call.filters[0][2]), ids);
  assert.ok(db.calls.every(call => call.filters[0][2].length <= 5 && call.limit === 500));
  await readWithdrawalParts([]);
  assert.equal(db.calls.length, 3);
});

test('la bandeja descarga solo 50 filas completas y mantiene el orden del resumen', async () => {
  const ids = Array.from({ length: 110 }, (_, i) => `u${i}`);
  const db = client(call => ({ data: call.filters[0][2].slice().reverse().map(id => ({ user_id: id })) }));
  const { readInboxPage, inboxIds } = moduleWith('inbox-data.ts', { './lib': { supabase: db }, './query-utils': { searchPattern, mergeMessages, searchFilter } });
  assert.deepEqual([...inboxIds([{ user_id: 'a', last_sender_id: 'a', completed_at: null }, { user_id: 'b', last_sender_id: 'staff', completed_at: null }], 'pending')], ['a']);
  const result = await readInboxPage('chat_inbox', ids, '', 1, new AbortController().signal);
  assert.equal(result.total, 110);
  assert.deepEqual([...result.rows.map(row => row.user_id)], ids.slice(50, 100));
  assert.equal(db.calls.length, 1);
});

test('la búsqueda de chats pagina ids y respeta la lista de conversaciones autorizadas', async () => {
  const ids = Array.from({ length: 430 }, (_, i) => `u${i}`);
  const db = client(call => ({ data: call.filters[0][2].filter(id => call.columns !== 'user_id' || ['u7', 'u410'].includes(id)).map(id => ({ user_id: id, last_body: 'match' })) }));
  const { readInboxPage } = moduleWith('inbox-data.ts', { './lib': { supabase: db }, './query-utils': { searchPattern, searchFilter } });
  const result = await readInboxPage('chat_inbox', ids, 'match', 0, new AbortController().signal);
  assert.equal(result.total, 2);
  assert.deepEqual([...result.rows.map(row => row.user_id)], ['u7', 'u410']);
  assert.equal(db.calls.length, 4);
  assert.ok(db.calls.every(call => call.filters[0][2].every(id => ids.includes(id))));
});

test('Atención separa espera y resueltas y prioriza pendientes antes de paginar', async () => {
  const { inboxIds, readInboxPage } = moduleWith('inbox-data.ts', { './lib': { supabase: client(call => ({ data: call.filters[0][2].map(user_id => ({ user_id })) })) }, './query-utils': { searchPattern, searchFilter } });
  const pending = Array.from({ length: 65 }, (_, i) => ({ user_id: `u${i}`, last_sender_id: `u${i}`, completed_at: null }));
  const rows = [{ user_id: 'waiting', last_sender_id: 'staff', completed_at: null }, ...pending, { user_id: 'closed', last_sender_id: 'closed', completed_at: '2026-11-11' }];
  assert.deepEqual([...inboxIds(rows, 'waiting')], ['waiting']);
  assert.deepEqual([...inboxIds(rows, 'completed')], ['closed']);
  assert.equal(inboxIds(rows, 'all').length, 67);
  const ids = inboxIds(rows, 'pending');
  const page = await readInboxPage('chat_inbox', ids, '', 0, new AbortController().signal);
  assert.equal(page.total, 65);
  assert.equal(page.rows.length, 50);
  assert.equal(page.rows[0].user_id, 'u64');
  assert.equal(page.rows[49].user_id, 'u15');
  const external = [{ thread_id: 'visitor', last_sender_type: 'visitor', completed_at: null }, { thread_id: 'staff', last_sender_type: 'staff', completed_at: null }, { thread_id: 'closed', last_sender_type: 'staff', completed_at: '2026-11-11' }];
  assert.deepEqual([...inboxIds(external, 'pending')], ['visitor']);
  assert.deepEqual([...inboxIds(external, 'waiting')], ['staff']);
});

test('la limpieza no elimina una imagen cuyo guardado se confirmó aunque se perdiera la respuesta', async () => {
  const removed = [];
  const db = client(() => ({ data: { portal_theme_designs: { custom: { logoPath: 'new-logo.webp' } }, portal_banners: [{ path: 'banner.webp' }] } }));
  db.storage = { from: () => ({ remove: async paths => { removed.push(...paths); return { error: null }; } }) };
  const { cleanupFailedSettingsUploads } = moduleWith('asset-cleanup.ts', { './lib': { supabase: db } });
  await cleanupFailedSettingsUploads(['new-logo.webp', 'unused.webp']);
  assert.deepEqual(removed, ['unused.webp']);
  const unavailable = client(() => ({ data: null, error: { message: 'offline' } }));
  unavailable.storage = db.storage;
  const retry = moduleWith('asset-cleanup.ts', { './lib': { supabase: unavailable } });
  await retry.cleanupFailedSettingsUploads(['possibly-committed.webp']);
  assert.deepEqual(removed, ['unused.webp']);
});
