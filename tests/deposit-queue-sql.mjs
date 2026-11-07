// PostgreSQL aislado en memoria. No lee .env ni admite conexiones a servidores.
// PGLITE_MODULE=/ruta/a/@electric-sql/pglite/dist/index.js node tests/deposit-queue-sql.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PGLITE_MODULE;
if (!modulePath) throw new Error('Indicá PGLITE_MODULE para ejecutar PostgreSQL local en memoria.');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const source = file => readFileSync(new URL(`../supabase/${file}`, import.meta.url), 'utf8');
const uid = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A=uid(1), B=uid(2), S=uid(3), P=uid(4), H=uid(5);
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema app_private;
revoke all on schema app_private from public;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
create table public.test_staff(user_id uuid primary key, deposit boolean, history boolean, super boolean);
create function public.is_super_admin() returns boolean language sql stable security definer as $$ select coalesce((select super from public.test_staff where user_id=auth.uid()),false) $$;
create function public.is_admin() returns boolean language sql stable security definer as $$ select exists(select 1 from public.test_staff where user_id=auth.uid()) $$;
create function public.has_admin_permission(p text) returns boolean language sql stable security definer as $$ select coalesce((select super or case p when 'deposit' then deposit when 'history' then history else false end from public.test_staff where user_id=auth.uid()),false) $$;
create table public.cashier_profiles(user_id uuid primary key references auth.users(id), display_name text, username text);
create table public.requests(id uuid primary key default gen_random_uuid(),user_id uuid,kind text,status text default 'pending',amount numeric,created_at timestamptz default now(),approved_at timestamptz,
 holder text,cbu text,alias text,receipt_path text,receipt_url text,bonus_id uuid,bonus_percent numeric default 0,bonus_amount numeric default 0,
 requested_special_bonus_id uuid,special_min_amount numeric default 0,special_max_amount numeric default 0,special_cooldown_hours integer default 0,special_daily_reset_time time);
alter table public.requests enable row level security;
grant select,update(status) on public.requests to authenticated;
create policy fixture_read on public.requests for select to authenticated using(public.is_admin());
create policy fixture_update on public.requests for update to authenticated using(public.has_admin_permission('deposit') or (kind='withdrawal' and public.is_admin()));
create table public.deposit_credits(request_id uuid primary key,user_id uuid,confirmed_by uuid,credited_at timestamptz default now());
create table public.user_notifications(id uuid primary key default gen_random_uuid(),user_id uuid,request_id uuid,kind text,title text,body text);
create unique index notification_unique on public.user_notifications(request_id) where kind='deposit_credited';
create table public.special_bonus_uses(request_id uuid primary key,user_id uuid,promotion_id uuid,used_at timestamptz,next_available_at timestamptz);
create view public.request_summaries as select r.*, coalesce(p.username,'Jugador') as user_name,d.credited_at from public.requests r left join public.cashier_profiles p on p.user_id=r.user_id left join public.deposit_credits d on d.request_id=r.id;
create function app_private.valid_holder(text) returns boolean language sql as $$ select true $$;
insert into auth.users(id,email) values ('${A}','ana@test'),('${B}','bea@test'),('${S}','super@test'),('${P}','player@test'),('${H}','history@test');
insert into public.test_staff values('${A}',true,false,false),('${B}',true,false,false),('${S}',true,true,true),('${H}',false,true,false);
insert into public.cashier_profiles values('${A}','Ana','ana'),('${B}','Bea','bea');
create table public.bank_operation_state(id boolean primary key,mode text,resumes_at timestamptz,next_shift_key text,outgoing_shift_key text,updated_at timestamptz);
create table public.work_shifts(key text primary key,active boolean,updated_at timestamptz);
create table public.bank_themes(key text primary key,background_path text,logo_path text);
create table public.bank_accounts(id uuid primary key,bank text,holder text,cbu text,alias text,theme_key text,active boolean,shift_key text,phone_number integer,usage_count integer default 0);
create table public.bank_account_assignments(id uuid primary key default gen_random_uuid(),user_id uuid,bank_account_id uuid,status text default 'reserved',expires_at timestamptz default now()+interval '10 min',created_at timestamptz default now());
create table public.sac_phones(phone_number integer);
`);
const special=source('migrations/057_timed_special_bonuses.sql');
await db.exec('create '+special.split('create function public.review_special_deposit')[1].split('revoke all on function public.review_special_deposit')[0].replace(/^\(/,'function public.review_special_deposit('));
// Cargar la lógica real de confirmación, incluidos los cambios de espera diaria.
await db.exec('create or replace function public.confirm_deposit_credit'+special.split('create or replace function public.confirm_deposit_credit')[1].split('create function public.special_bonus_availability')[0]);
const daily=source('migrations/080_daily_free_spin_reset.sql');
await db.exec('do $$ declare d'+daily.split('do $$ declare d')[1].split('create or replace function public.special_bonus_availability')[0]);
const guard=source('migrations/085_adjust_withdrawal_amount.sql').split('create or replace function public.guard_request_input()')[1].split('create or replace function public.adjust_withdrawal_amount')[0];
await db.exec('create or replace function public.guard_request_input()'+guard);
await db.exec('create trigger guard_request_input before update on public.requests for each row execute function public.guard_request_input()');
const banking=source('migrations/038_sac_stations.sql').split('create or replace function public.assign_bank_account()')[1].split('do $$ begin')[0];
await db.exec('create or replace function public.assign_bank_account()'+banking);
await db.exec(source('optimization-drafts/06_bandeja_compartida.sql'));
const as = async actor => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${actor}',false); select set_config('request.jwt.claim.role','authenticated',false); set role authenticated;`); };
const rpc=async (name,args=[]) => {
  const params=args.map((_,i)=>`$${i+1}`).join(',');
  if (name==='list_deposit_claim_events') return (await db.query(`select * from public.${name}(${params})`,args)).rows;
  return (await db.query(`select public.${name}(${params}) as value`,args)).rows[0].value;
};
const rejects=async (task,pattern)=>assert.rejects(task,pattern);
await db.exec(`insert into public.requests(id,user_id,kind,amount,created_at) select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${P}','deposit',1000,now()+n*interval '1 second' from generate_series(100,165) n;
insert into public.requests(id,user_id,kind,status,amount) values('${uid(166)}','${P}','deposit','approved',5000),('${uid(167)}','${P}','withdrawal','pending',1000);`);
await as(A);
assert.equal(await rpc('get_deposit_queue_mode'),1);
const page=await rpc('list_deposit_queue',['available',0]);
assert.equal(page.total,66); assert.equal(page.rows.length,30); assert.equal(page.rows[0].id,uid(100));
assert.equal((await rpc('list_deposit_queue',['available',1])).rows[0].id,uid(130));
const first=await rpc('take_deposit',[uid(100)]);
assert.equal(first.claimed_name,'Ana'); assert.ok(first.claim_token);
assert.equal((await rpc('take_deposit',[uid(100)])).claim_token,first.claim_token,'retomar es idempotente');
await rejects(()=>rpc('take_deposit',[uid(167)]),/ya no está disponible/);
await as(B);
await rejects(()=>rpc('take_deposit',[uid(100)]),/tomada por otro/);
await rejects(()=>rpc('release_deposit',[uid(100),first.claim_token]),/asignación/);
await rejects(()=>rpc('review_queue_deposit',[uid(100),first.claim_token,'approved',null,true]),/asignación/);
await rejects(()=>rpc('reassign_deposit',[uid(100),first.claim_token,'Revisión']),/permiso/);
await as(A);
await rpc('release_deposit',[uid(100),first.claim_token]);
await rejects(()=>rpc('review_queue_deposit',[uid(100),first.claim_token,'approved',null,true]),/asignación/);
await as(B);
const second=await rpc('take_deposit',[uid(100)]); assert.notEqual(first.claim_token,second.claim_token);
await db.exec(`update public.requests set status='approved' where id='${uid(100)}'`);
assert.equal((await db.query(`select status from public.requests where id='${uid(100)}'`)).rows[0].status,'pending','REST antiguo no puede aprobar');
await rejects(()=>rpc('review_special_deposit',[uid(100),1000,true]),/permission denied/);
await rejects(()=>rpc('confirm_deposit_credit',[uid(100)]),/permission denied/);
await rpc('review_queue_deposit',[uid(100),second.claim_token,'approved',null,true]);
await rejects(()=>rpc('release_deposit',[uid(100),second.claim_token]),/supervisor/);
await as(S);
await rejects(()=>rpc('reassign_deposit',[uid(100),first.claim_token,'Revisión previa']),/asignación/);
await rejects(()=>rpc('reassign_deposit',[uid(100),second.claim_token,'x']),/motivo/);
const assumed=await rpc('reassign_deposit',[uid(100),second.claim_token,'Bea confirmó que todavía no acreditó']);
assert.notEqual(assumed.claim_token,second.claim_token);
await as(B);
await rejects(()=>rpc('confirm_queue_deposit_credit',[uid(100),second.claim_token]),/asignación/);
await as(S);
const result=await rpc('confirm_queue_deposit_credit',[uid(100),assumed.claim_token]); assert.equal(result.newly_credited,true);
assert.equal((await rpc('confirm_queue_deposit_credit',[uid(100),assumed.claim_token])).newly_credited,false);
const events=await rpc('list_deposit_claim_events',[uid(100)]);
assert.equal(events.filter(row=>row.event==='credited').length,1); assert.equal(events[0].actor_name,'super');
assert.ok(!(await rpc('list_deposit_queue',['all',0])).rows.some(row=>row.id===uid(100)));
await rejects(()=>rpc('take_deposit',[uid(166)]),/supervisor/);
const legacy=await rpc('reassign_deposit',[uid(166),null,'Revisada en plataforma, pendiente de acreditar']);
assert.ok(legacy.credit_started_at);
await rejects(()=>rpc('release_deposit',[uid(166),legacy.claim_token]),/supervisor/);
await as(A);
const rejected=await rpc('take_deposit',[uid(101)]);
await rpc('review_queue_deposit',[uid(101),rejected.claim_token,'rejected',null,true]);
await rejects(()=>rpc('confirm_queue_deposit_credit',[uid(101),rejected.claim_token]),/aprobada/);
// Los bonos especiales usan la función vigente; conservar el reset diario es parte de la prueba.
await db.exec(`reset role; insert into public.requests(id,user_id,kind,amount,bonus_id,requested_special_bonus_id,bonus_amount,special_min_amount,special_max_amount,special_cooldown_hours,special_daily_reset_time)
 values('${uid(180)}','${P}','deposit',1000,'${uid(800)}','${uid(800)}',500,1000,2000,24,'09:00'),
 ('${uid(181)}','${P}','deposit',1000,'${uid(801)}','${uid(801)}',500,1000,2000,24,'09:00');`);
await as(A);
const specialClaim=await rpc('take_deposit',[uid(180)]);
await rejects(()=>rpc('review_queue_deposit',[uid(180),specialClaim.claim_token,'approved',500,true]),/condiciones del bono/);
const specialApproved=await rpc('review_queue_deposit',[uid(180),specialClaim.claim_token,'approved',1500,true]);
assert.equal(Number(specialApproved.amount),1500); assert.equal(Number(specialApproved.bonus_amount),500);
await rpc('confirm_queue_deposit_credit',[uid(180),specialClaim.claim_token]);
const plainClaim=await rpc('take_deposit',[uid(181)]);
const plainApproved=await rpc('review_queue_deposit',[uid(181),plainClaim.claim_token,'approved',500,false]);
assert.equal(Number(plainApproved.amount),500); assert.equal(plainApproved.bonus_id,null); assert.equal(Number(plainApproved.bonus_amount),0);
const ownFirst=await rpc('take_deposit',[uid(102)]);
await rpc('release_deposit',[uid(102),ownFirst.claim_token]);
const ownSecond=await rpc('take_deposit',[uid(102)]);
await rejects(()=>rpc('review_queue_deposit',[uid(102),ownFirst.claim_token,'approved',null,true]),/asignación/);
assert.notEqual(ownSecond.claim_token,ownFirst.claim_token,'volver al mismo responsable también invalida la pantalla anterior');
await rejects(()=>db.query(`insert into public.deposit_claim_events(request_id,actor,event) values('${uid(102)}','${A}','credited')`),/permission denied/);
await db.exec(`update public.requests set status='approved' where id='${uid(167)}'`);
assert.equal((await db.query(`select status from public.requests where id='${uid(167)}'`)).rows[0].status,'approved','el retiro mantiene su flujo anterior');
await db.exec('reset role');
const waits=await db.query('select extract(epoch from next_available_at-used_at)::int as seconds from public.special_bonus_uses');
assert.equal(waits.rows.length,1); assert.ok(waits.rows[0].seconds>0 && waits.rows[0].seconds<=86400);
await as(H);
assert.ok((await rpc('list_deposit_claim_events',[uid(100)])).length);
await rejects(()=>rpc('list_deposit_queue',['all',0]),/permiso/);
await as(P);
await rejects(()=>rpc('list_deposit_queue',['all',0]),/permiso/);
await rejects(()=>rpc('take_deposit',[uid(102)]),/permiso/);
assert.equal((await db.query('select * from public.deposit_claims')).rows.length,0,'jugadores no leen tomas');
await db.exec('reset role; set role anon');
await rejects(()=>rpc('take_deposit',[uid(103)]),/permission denied/);
await db.exec('reset role');
assert.equal((await db.query('select count(*)::int as n from public.deposit_credits')).rows[0].n,2);
assert.equal((await db.query('select count(*)::int as n from public.user_notifications')).rows[0].n,2);
// El reparto ya no exige teléfonos SAC, pero respeta el turno y las reservas vigentes.
await db.exec(`insert into public.bank_operation_state(id,mode) values(true,'online'); insert into public.work_shifts(key,active) values('morning',true),('night',false);
insert into public.bank_themes(key) values('bank'); insert into public.sac_phones values(99);
insert into public.bank_accounts(id,bank,holder,cbu,alias,theme_key,active,shift_key,phone_number) values('${uid(500)}','Banco','Titular','0123456789012345678901','banco.test','bank',true,'morning',1);`);
await as(P);
const bank=(await db.query('select * from public.assign_bank_account()')).rows[0]; assert.equal(bank.id,uid(500));
assert.equal((await db.query('select * from public.assign_bank_account()')).rows[0].assignment_id,bank.assignment_id);
await db.exec("reset role; update public.bank_operation_state set mode='maintenance'"); await as(P);
await rejects(()=>db.query('select * from public.assign_bank_account()'),/mantenimiento/);
// Borrador 07 con validate_request vigente: límites y horario son comprobaciones independientes.
await db.exec(`reset role;
create table public.promotions(id uuid primary key,title text,active boolean default true,selectable boolean default true,
 bonus_mode text default 'percent',bonus_percent numeric default 50,bonus_amount numeric default 0,
 min_amount numeric default 1000,max_amount numeric default 50000,load_number_from integer default 1,load_number_to integer,
 cooldown_hours integer default 0,reward_type text default 'cash',reward_label text default '');
alter table public.requests add column bank_assignment_id uuid, add column bank_account_id uuid,add column cloudinary_asset_id text,
 add column bonus_load_number integer,add column bonus_reward_type text,add column bonus_reward_label text;
alter table public.bank_account_assignments add column confirmed_at timestamptz;`);
const validation=source('migrations/069_bonus_deposit_load_window.sql').split('create or replace function public.validate_request()')[1].split('revoke all on function public.validate_request()')[0];
await db.exec('create or replace function public.validate_request()'+validation);
await db.exec('create trigger validate_request before insert on public.requests for each row execute function public.validate_request()');
await db.exec(source('optimization-drafts/07_bonos_por_horario.sql'));
const scheduleCases=[
 ['14:00','17:00',[1,2,3,4,5,6,7],'2026-11-07T13:59:59-03:00',false],
 ['14:00','17:00',[1,2,3,4,5,6,7],'2026-11-07T14:00:00-03:00',true],
 ['14:00','17:00',[1,2,3,4,5,6,7],'2026-11-07T16:59:59-03:00',true],
 ['14:00','17:00',[1,2,3,4,5,6,7],'2026-11-07T17:00:00-03:00',false],
 ['23:00','02:00',[5],'2026-11-07T01:59:59-03:00',true],
 ['23:00','02:00',[5],'2026-11-07T02:00:00-03:00',false],
 ['23:00','02:00',[5],'2026-11-07T23:00:00-03:00',false],
 ['23:00','01:00',[7],'2026-11-09T00:30:00-03:00',true],
];
for(const [start,end,days,stamp,expected] of scheduleCases) {
 const actual=await db.query('select app_private.bonus_schedule_open($1,$2,$3::smallint[],$4) as open',[start,end,days,stamp]);
 assert.equal(actual.rows[0].open,expected,stamp);
}
await rejects(()=>db.query("insert into public.promotions(id,bonus_start_time,bonus_end_time) values($1,'14:00','14:00')",[uid(850)]),/promotions_daily_window/);
await rejects(()=>db.query("insert into public.promotions(id,bonus_start_time,bonus_end_time,bonus_days) values($1,'14:00','17:00','{}')",[uid(850)]),/promotions_daily_window/);
await rejects(()=>db.query("insert into public.promotions(id,bonus_start_time,bonus_end_time) values($1,'14:00:01','17:00')",[uid(850)]),/promotions_daily_window/);
await db.exec(`insert into public.promotions(id,title,bonus_start_time,bonus_end_time) values('${uid(851)}','Horario de prueba',
 (date_trunc('minute',statement_timestamp() at time zone 'America/Asuncion')-interval '5 min')::time,
 (date_trunc('minute',statement_timestamp() at time zone 'America/Asuncion')+interval '5 min')::time);
insert into public.bank_account_assignments(id,user_id,bank_account_id) values('${uid(852)}','${P}','${uid(500)}'),('${uid(853)}','${P}','${uid(500)}'),('${uid(854)}','${P}','${uid(500)}');`);
const submit=async(id,amount,assignment)=>db.query(`insert into public.requests(id,user_id,kind,amount,bonus_id,bank_assignment_id,receipt_url,cloudinary_asset_id)
 values($1,$2,'deposit',$3,$4,$5,'https://example.test/receipt','test-asset') returning bonus_percent,amount`,[id,P,amount,uid(851),assignment]);
const registered=await submit(uid(855),50000,uid(852));assert.equal(Number(registered.rows[0].bonus_percent),50);
await rejects(()=>submit(uid(856),50000.01,uid(853)),/no está habilitado/);
await db.exec(`update public.promotions set bonus_start_time=(date_trunc('minute',statement_timestamp() at time zone 'America/Asuncion')+interval '1 hour')::time,
 bonus_end_time=(date_trunc('minute',statement_timestamp() at time zone 'America/Asuncion')+interval '2 hours')::time where id='${uid(851)}'`);
await rejects(()=>submit(uid(857),50000,uid(854)),/fuera de su horario/);
assert.equal((await db.query(`select status from public.bank_account_assignments where id='${uid(854)}'`)).rows[0].status,'reserved','rechazar el horario revierte el consumo de la cuenta');
// La promoción ya cerró, pero una carga registrada a tiempo conserva su 50% y puede atenderse.
await as(A);
const onTime=await rpc('take_deposit',[uid(855)]);
const onTimeReviewed=await rpc('review_queue_deposit',[uid(855),onTime.claim_token,'approved',null,true]);
assert.equal(Number(onTimeReviewed.bonus_percent),50);
await rpc('confirm_queue_deposit_credit',[uid(855),onTime.claim_token]);
await db.close();
console.log('OK: bandeja compartida, permisos, tokens, auditoría, idempotencia, reparto sin SAC y bonos por horario con límite de carga y aprobación posterior al cierre.');
