import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { forEachConcurrent } from '../supabase/functions/_shared/concurrency.ts';

async function runWorker({ announcements, devices, fail = () => null }) {
  const queries = [];
  const updates = [];
  const delivered = [];
  let running = 0;
  let peak = 0;
  let handler;
  const service = {
    rpc: async name => ({ data: name === 'verify_announcement_job_key' ? true : announcements, error: null }),
    from(table) {
      const call = { table, filters: [], operation: 'select' };
      queries.push(call);
      const query = {
        select: () => query,
        in(column, value) { call.filters.push([column, value]); return query; },
        order: () => query,
        range(from, to) { call.range = [from, to]; return query; },
        update(value) { call.operation = 'update'; call.value = value; return query; },
        delete() { call.operation = 'delete'; return query; },
        eq(column, value) { call.filters.push([column, value]); return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (call.operation === 'update') updates.push(call);
            return { data: table === 'push_subscriptions' && call.operation === 'select' ? devices.slice(call.range[0], call.range[1] + 1) : null, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const webpush = { setVapidDetails() {}, async sendNotification(device, payload, options) {
    assert.equal(options.timeout, 10_000);
    running++; peak = Math.max(peak, running);
    try {
      await new Promise(resolve => setTimeout(resolve, 1));
      const failure = fail(device.endpoint);
      if (failure) throw { statusCode: failure };
      delivered.push({ endpoint: device.endpoint, payload: JSON.parse(payload) });
    } finally { running--; }
  } };
  const dependencies = {
    'npm:web-push@3.6.7': { default: webpush },
    '../_shared/http.ts': { cors: {}, HttpError, json: (value, status = 200) => new Response(JSON.stringify(value), { status }), serverClient: () => service },
    '../_shared/concurrency.ts': { forEachConcurrent },
  };
  const source = readFileSync(new URL('../supabase/functions/send-announcement-push/index.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { exports: {}, require: name => dependencies[name], Deno: { serve: value => { handler = value; }, env: { get: () => 'test' } }, console, Map, Set, Response, Request });
  const response = await handler(new Request('https://local.test', { method: 'POST', headers: { apikey: 'test' } }));
  return { body: await response.json(), status: response.status, queries, updates, delivered, peak };
}

test('el trabajador consulta dispositivos por lote y limita los envíos simultáneos', async () => {
  const announcements = Array.from({ length: 25 }, (_, i) => ({ id: `n${i}`, user_id: `u${i}`, title: 'Aviso', body: 'Prueba' }));
  const devices = announcements.map(item => ({ user_id: item.user_id, endpoint: `https://device.test/${item.user_id}`, p256dh: 'p', auth_secret: 'a' }));
  const result = await runWorker({ announcements, devices });
  assert.equal(result.status, 200);
  assert.equal(result.body.sent, 25);
  assert.equal(result.delivered.length, 25);
  assert.equal(result.peak, 5);
  assert.equal(result.queries.filter(call => call.table === 'push_subscriptions' && call.operation === 'select').length, 1);
  assert.equal(result.updates.length, 25);
  assert.ok(result.updates.every(call => typeof call.value.push_sent_at === 'string'));
});

test('los endpoints vencidos se eliminan y un fallo transitorio conserva el aviso pendiente', async () => {
  const announcements = [{ id: 'gone-notice', user_id: 'gone-user', title: 'Aviso', body: 'Prueba' }, { id: 'retry-notice', user_id: 'retry-user', title: 'Aviso', body: 'Prueba' }];
  const devices = [{ user_id: 'gone-user', endpoint: 'gone' }, { user_id: 'retry-user', endpoint: 'retry' }];
  const result = await runWorker({ announcements, devices, fail: endpoint => endpoint === 'gone' ? 410 : 503 });
  assert.equal(result.status, 200);
  assert.equal(result.queries.filter(call => call.operation === 'delete').length, 1);
  const retry = result.updates.find(call => call.filters.some(([key, value]) => key === 'id' && value === 'retry-notice'));
  assert.equal(retry.value.push_sent_at, null);
  assert.equal(retry.value.push_claimed_at, null);
});
