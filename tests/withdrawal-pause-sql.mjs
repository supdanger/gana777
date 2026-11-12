import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite }=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();const user='10000000-0000-4000-8000-000000000001',admin='10000000-0000-4000-8000-000000000002';
const file=name=>readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const fn=(text,name)=>{const match=text.match(new RegExp('create(?: or replace)? function '+name.replaceAll('.','\\.')+'\\([\\s\\S]+?end[;]? \\$\\$;','i'));assert.ok(match,name);return match[0]};
async function actor(id,allowed=false){await db.exec('reset role');await db.query("select set_config('test.uid',$1,false),set_config('test.staff',$2,false)",[id,String(allowed)]);await db.exec('set role authenticated')}
const create=async (amount=8000)=>(await db.query('select * from public.create_withdrawal($1,$2,$3,null)',[String(amount),'Persona de prueba','0123456789012345678901'])).rows[0];
const reject=async(id,minutes=null,reason='Solicitud revisada por soporte')=>(await db.query('select public.reject_withdrawal_with_pause($1,$2,$3) data',[id,reason,minutes])).rows[0].data;
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema app_private;create schema storage;create publication supabase_realtime;
 create table auth.users(id uuid primary key);insert into auth.users values('${user}'),('${admin}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select 'authenticated'::text$$;
 create function public.has_admin_permission(p text) returns boolean language sql stable as $$select current_setting('test.staff',true)='true'$$;
 create function public.is_admin() returns boolean language sql stable as $$select current_setting('test.staff',true)='true'$$;
 create function public.account_access_allowed() returns boolean language sql stable as $$select true$$;
 create function public.account_request_guard() returns void language plpgsql stable as $$begin return;end$$;
 create table public.requests(id uuid primary key default gen_random_uuid(),user_id uuid,kind text,amount numeric,status text default 'pending',holder text,cbu text,alias text,created_at timestamptz default now(),approved_at timestamptz,requested_special_bonus_id uuid);
 create table public.withdrawal_parts(request_id uuid,part_number integer,amount numeric,receipt_path text,paid_at timestamptz,paid_by uuid,source_bank_account_id uuid,source_bank_name text,source_alias text,primary key(request_id,part_number));
 grant usage on schema auth to authenticated;grant select,insert,update on public.requests to authenticated;grant select on public.withdrawal_parts to authenticated;
 create table public.bank_accounts(id uuid primary key,bank text,alias text,active boolean,shift_key text);
 create table public.work_shifts(key text,active boolean);insert into public.work_shifts values('morning',true);
 create table public.bank_operation_state(mode text);insert into public.bank_operation_state values('online');
 create function public.get_bank_operation_status() returns integer language sql as $$select 1$$;
 create table storage.objects(bucket_id text,name text);
 create table public.user_notifications(user_id uuid,request_id uuid,part_number integer,kind text,title text,body text);`);
 const security=await file('005_security_hardening.sql');const holder=security.match(/create or replace function app_private\.valid_holder\([\s\S]+?\$\$;/)[0];
 await db.exec(holder);await db.exec(fn(security,'public.create_withdrawal'));
 await db.exec(await file('085_adjust_withdrawal_amount.sql'));
 await db.exec(fn(await file('006_withdrawal_countdown.sql'),'public.track_withdrawal_window'));
 await db.exec(fn(await file('026_withdrawal_parts.sql'),'public.create_withdrawal_parts'));
 await db.exec(`create trigger guard_request_input before insert or update on public.requests for each row execute function public.guard_request_input();create trigger track_withdrawal_window before insert or update on public.requests for each row execute function public.track_withdrawal_window();create trigger create_withdrawal_parts after insert on public.requests for each row execute function public.create_withdrawal_parts();`);
 await db.exec(await file('101_minimum_withdrawal_amount.sql'));await db.exec(await file('108_withdrawal_rejection_pause.sql'));
 await db.exec(fn(await file('029_withdrawal_source_cooldown.sql'),'public.confirm_withdrawal_part'));
 await actor(user);await assert.rejects(create(4999),/5.000/);let r=await create();await assert.rejects(create(),/pendiente/);
 await assert.rejects(reject(r.id,15),/permiso/);await actor(admin,true);
 for(const invalid of [0,30,60,-1,1440])await assert.rejects(reject(r.id,invalid),/15 minutos/);
 await assert.rejects(reject(r.id,15,'x'),/motivo/);await assert.rejects(reject(r.id,15,'\n\t\n\t\n'),/motivo/);
 let result=await reject(r.id);assert.equal(result.minutes,null);assert.equal(result.paused_until,null);
 await actor(user);assert.equal((await db.query('select public.get_my_withdrawal_pause() data')).rows[0].data.last_rejection.reason,'Solicitud revisada por soporte');
 for(const duration of [15,120,360,720]){
  r=await create();await actor(admin,true);result=await reject(r.id,duration);
  const original=result.paused_until;assert.equal(result.minutes,duration);
  assert.equal((await reject(r.id,duration)).paused_until,original,'retry never extends the pause');
  assert.equal((await reject(r.id,720)).minutes,duration,'retry cannot change the original penalty');
  assert.equal((await reject(r.id,null)).paused_until,original,'retry without pause does not clear an active penalty');
  assert.equal((await db.query('select count(*)::int n from public.withdrawal_rejections where request_id=$1',[r.id])).rows[0].n,1);
  await actor(user);await assert.rejects(create(),/pausa activa/);
  await assert.rejects(db.query(`insert into public.requests(user_id,kind,amount,holder,cbu) values($1,'withdrawal',8000,'Persona de prueba','0123456789012345678901')`,[user]),/pausa activa/);
  await assert.rejects(db.exec("update public.withdrawal_pauses set paused_until=now()"));
  await db.query(`insert into public.requests(user_id,kind,amount) values($1,'deposit',1000)`,[user]);
  const mine=(await db.query('select public.get_my_withdrawal_pause() data')).rows[0].data;assert.equal(mine.paused_until,original);
  await actor(admin,true);assert.equal((await db.query('select * from public.withdrawal_pauses')).rows.length,1);
  await db.exec('reset role');await db.exec("update public.withdrawal_pauses set paused_until=now()-interval '1 second'");await actor(user);
 }
 r=await create(250000);await actor(admin,true);await db.query('select public.adjust_withdrawal_amount($1,220000)',[r.id]);assert.equal((await db.query('select count(*)::int n from public.withdrawal_parts where request_id=$1',[r.id])).rows[0].n,3,'amount adjustment still creates parts');
 await db.exec('reset role');await db.query('update public.withdrawal_parts set paid_at=now() where request_id=$1 and part_number=1',[r.id]);await actor(admin,true);await assert.rejects(reject(r.id,15),/pagos realizados/);assert.equal((await db.query('select status from public.requests where id=$1',[r.id])).rows[0].status,'pending');
 // Preserve the payment RPC and its 24-hour rule on a separate player.
 const payUser='10000000-0000-4000-8000-000000000003',bank='10000000-0000-4000-8000-000000000004';await db.exec('reset role');await db.exec(`insert into auth.users values('${payUser}');insert into public.bank_accounts values('${bank}','Banco ejemplo','mi.alias',true,'morning')`);await actor(payUser);const pay=await create();await actor(admin,true);await db.query('select public.adjust_withdrawal_amount($1,4500)',[pay.id]);const receipt=pay.id+'/1/10000000-0000-4000-8000-000000000005.jpg';await db.exec('reset role');await db.query("insert into storage.objects values('withdrawal-receipts',$1)",[receipt]);await actor(admin,true);await db.query('select public.confirm_withdrawal_part($1,1,$2,$3)',[pay.id,receipt,bank]);assert.equal((await db.query('select status from public.requests where id=$1',[pay.id])).rows[0].status,'approved');
 await actor(payUser);await assert.rejects(create(),/24 horas/);assert.equal((await db.query('select * from public.withdrawal_rejections')).rows.length,0,'player cannot see other users reasons');
 await db.exec('reset role');await db.exec('set role anon');await assert.rejects(db.query('select public.get_my_withdrawal_pause()'));
 console.log('SQL: 4 pausas, mínimo 5000, rechazo sin pausa, motivo/permisos, RPC e INSERT directo, reintento idempotente, depósitos, pagos parciales, ajuste, pago original y espera de 24 h correctos.');
}finally{await db.close()}
