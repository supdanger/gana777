// PostgreSQL temporal en memoria: no lee .env ni se conecta a producción.
// PGLITE_MODULE=/ruta/a/pglite/dist/index.js node tests/withdrawal-minimum-sql.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

if (!process.env.PGLITE_MODULE) throw new Error('Indicá PGLITE_MODULE para ejecutar PostgreSQL local en memoria.');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
const security = readFileSync(new URL('../supabase/migrations/005_security_hardening.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/101_minimum_withdrawal_amount.sql', import.meta.url), 'utf8');
const rpc = security.match(/create or replace function public\.create_withdrawal\([\s\S]+?end \$\$;/)?.[0];
const holder = security.match(/create or replace function app_private\.valid_holder\([\s\S]+?\$\$;/)?.[0];
assert.ok(rpc && holder);
try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema app_private;
    create function auth.uid() returns uuid language sql as $$ select '10000000-0000-4000-8000-000000000001'::uuid $$;
    create function auth.role() returns text language sql as $$ select 'authenticated'::text $$;
    create table public.requests(id uuid primary key default gen_random_uuid(), user_id uuid, kind text, amount numeric,
      status text default 'pending', holder text, cbu text, alias text);
    grant usage on schema public,auth to authenticated;
    grant select,insert,update on public.requests to authenticated;
    insert into public.requests(kind,amount) values ('withdrawal',1000);`);
  await db.exec(holder);
  await db.exec(rpc);
  await db.exec(migration);
  await db.exec(migration); // Idempotencia de la instalación.
  await db.exec('set role authenticated;');
  for (const amount of [0.01, 1000, 4999, 4999.99]) {
    await assert.rejects(db.query("insert into public.requests(kind,amount) values ('withdrawal',$1)", [amount]), error => error.code === '22023' && error.message.includes('$5.000'));
    await assert.rejects(db.query("select * from public.create_withdrawal($1,'Persona Prueba','0123456789012345678901',null)", [String(amount)]), error => error.code === '22023' && error.message.includes('$5.000'));
  }
  for (const amount of ['5000', '5000.01', '10000000']) {
    const result = await db.query("select * from public.create_withdrawal($1,'Persona Prueba','0123456789012345678901',null)", [amount]);
    assert.equal(Number(result.rows[0].amount), Number(amount));
  }
  await db.exec("insert into public.requests(kind,amount) values ('deposit',1000),('withdrawal',5000); update public.requests set status='approved' where kind='withdrawal' and amount=1000;");
  const legacy = await db.query("select status from public.requests where kind='withdrawal' and amount=1000");
  assert.equal(legacy.rows[0].status, 'approved');
  console.log('OK: mínimo en RPC e inserción directa, límite inclusivo, cargas sin cambios, retiro anterior conservado e instalación idempotente.');
} finally { await db.close(); }
