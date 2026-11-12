import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.player_access_requests(id uuid primary key,username text,device_hash text,ip_hash text,footprint_hash text,origin_user_agent text,created_at timestamptz default now());
    create table public.user_profiles(user_id uuid,username text);
    insert into public.player_access_requests(id,username,device_hash,ip_hash) values ('00000000-0000-4000-8000-000000000001','familia_a','browser_a','family_ip'),('00000000-0000-4000-8000-000000000002','familia_b','browser_b','family_ip');`);
  for (const file of ['103_manual_access_ip_blocks.sql','104_access_security_controls.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const id='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000099';
  const apply=(action,minutes=null,reason='Revisión de seguridad')=>db.query('select public.apply_access_security($1,$2,$3,$4,$5)',[id,actor,action,reason,minutes]);
  const blocked=async(ip,browser)=>(await db.query('select public.check_access_security($1,$2) blocked',[ip,browser])).rows[0].blocked;
  assert.equal(await blocked('family_ip','browser_b'),false);
  await assert.rejects(apply('pause',0)); await assert.rejects(apply('pause',43201)); await assert.rejects(apply('browser',null,'x'));
  await apply('pause',15);
  assert.equal(await blocked('other_ip','browser_a'),true);
  assert.equal(await blocked('family_ip','browser_b'),false);
  await assert.rejects(db.exec(`insert into public.player_access_requests(id,device_hash,ip_hash) values ('00000000-0000-4000-8000-000000000003','browser_a','other_ip')`));
  await db.exec("update public.access_security_controls set expires_at=now()-interval '1 second'");
  assert.equal(await blocked('other_ip','browser_a'),false);
  await apply('browser'); await assert.rejects(apply('pause',120)); await apply('unblock_browser');
  assert.equal(await blocked('other_ip','browser_a'),false);
  await apply('ip'); assert.equal(await blocked('family_ip','browser_b'),true);
  await apply('exception'); assert.equal(await blocked('family_ip','browser_b'),true);
  await apply('review'); await apply('unblock_ip');
  assert.equal(await blocked('family_ip','browser_b'),false);
  const result=(await db.query('select public.read_access_security($1) data',[id])).rows[0].data;
  assert.equal(result.controls.length,0);assert.equal(result.related[0].username,'familia_b');assert.equal(result.related[0].same_browser,false);assert.ok(result.events.some(e=>e.action==='exception'));
  assert.equal(JSON.stringify(result).includes('family_ip'),false);
  if (process.env.SECURITY_SQL_PROFILE) {
    await db.exec(`insert into public.access_security_events(request_id,actor_id,action,reason,scope,subject_hash,created_at)
      select md5(g::text)::uuid,'${actor}','ip','Evento sintético de medición','ip','hash-'||g::text,now()-g*interval '1 second' from generate_series(1,100000) g;
      analyze public.access_security_events;`);
    const sql='explain (analyze,buffers,format json) select id,action,reason from public.access_security_events where request_id=$1 or (scope=$2 and subject_hash=$3) or (scope=$4 and subject_hash=$5) order by created_at desc,id desc limit 30';
    const params=[id,'ip','family_ip','browser','browser_a'];
    const before=(await db.query(sql,params)).rows[0]['QUERY PLAN'][0];
    const migration=await readFile(new URL('../supabase/migrations/106_security_request_efficiency.sql',import.meta.url),'utf8');
    await db.exec(migration.match(/create index access_security_events_subject_recent[^;]+;/)[0]);
    await db.exec('analyze public.access_security_events');
    const after=(await db.query(sql,params)).rows[0]['QUERY PLAN'][0];
    const report={environment:'Isolated PostgreSQL/WASM PGlite, 100000 synthetic security events; not production latency',before,after};
    await writeFile('/tmp/gana777-security-sql-profile.json',JSON.stringify(report,null,2));
    assert.match(JSON.stringify(after),/access_security_events_subject_recent/);
    console.log('Security query profile saved: /tmp/gana777-security-sql-profile.json');
  }
  await db.exec('set role authenticated');await assert.rejects(db.query('select public.apply_access_security($1,$2,$3,$4,$5)',[id,actor,'ip','Intento sin permiso',null]));await assert.rejects(db.exec('select * from public.access_security_events'));
  console.log('SQL: pausa, vencimiento, bloqueo de navegador/IP, familia compartida, excepciones, auditoría y permisos correctos.');
} finally { await db.close(); }
