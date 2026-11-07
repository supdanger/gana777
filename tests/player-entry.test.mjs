import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function endpoint({ claimError = null, active = true, verifyError = null } = {}) {
  const calls = [];
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const server = {
    rpc: async () => { calls.push('claim'); return { data: 'player', error: claimError }; },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { email: 'player@players.gana777.internal' } } }),
        generateLink: async () => { calls.push('generate'); return { data: { properties: { hashed_token: 'single-use-internal' } } }; },
      },
      verifyOtp: async () => { calls.push('verify'); return { data: { user: { id: 'player' }, session: { access_token: 'access', refresh_token: 'refresh' } }, error: verifyError }; },
    },
    from: () => { const chain = { select: () => chain, eq: () => chain, is: () => chain, gt: () => chain, maybeSingle: async () => ({ data: active ? { user_id: 'player' } : null }) }; return chain; },
  };
  const source = readFileSync(new URL('../supabase/functions/player-entry/index.ts', import.meta.url), 'utf8');
  let handler;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: {}, Response, Deno: { serve: fn => { handler = fn; } }, require: name => name.endsWith('/http.ts')
      ? { cors: {}, HttpError, json: (value, status = 200) => new Response(JSON.stringify(value), { status }), serverClient: () => server }
      : { entryHash: async () => 'hash' },
  });
  return { calls, call: token => handler(new Request('https://test.invalid', { method: 'POST', body: JSON.stringify({ token }) })) };
}

test('un secreto inválido o vencido no llega a generar una sesión', async () => {
  const invalid = endpoint();
  assert.equal((await invalid.call('short')).status, 410);
  assert.deepEqual(invalid.calls, []);
  const expired = endpoint({ claimError: { message: 'entry_expired' } });
  assert.equal((await expired.call('a'.repeat(32))).status, 410);
  assert.deepEqual(expired.calls, ['claim']);
});
test('el ingreso devuelve sesión sin exponer el enlace interno de Auth', async () => {
  const api = endpoint();
  const response = await api.call('a'.repeat(32));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { access_token: 'access', refresh_token: 'refresh' });
  assert.deepEqual(api.calls, ['claim', 'generate', 'verify']);
});
test('una revocación concurrente y un fallo de Auth no entregan credenciales', async () => {
  for (const options of [{ active: false }, { verifyError: { message: 'internal private error' } }]) {
    const response = await endpoint(options).call('a'.repeat(32));
    assert.notEqual(response.status, 200);
    const body = await response.text();
    assert.ok(!/access_token|refresh_token|internal private/.test(body));
  }
});
