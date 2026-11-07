import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { bonusScheduleOpen, nextBonusScheduleChange, parseBonusSchedule, bonusScheduleText, bonusScheduleColumns } from '../supabase/functions/_shared/bonus-schedule.ts';
import { bonusEnabled, asBonusRule } from '../supabase/functions/_shared/bonus-rule.ts';
import { creditAmounts } from '../src/amounts.ts';
import { assertFormFields, parseAmount, parseUuid, InputError } from '../supabase/functions/_shared/validation.ts';
const at = value => Date.parse(value);
const daily = parseBonusSchedule(true,'14:00','17:00',[1,2,3,4,5,6,7]);

test('50% en cargas hasta 50.000: inicio incluido, fin excluido, sin confundir el tope del premio',()=>{
  const rule=asBonusRule({bonus_mode:'percent',bonus_percent:50,min_amount:1000,max_amount:50000});
  assert.equal(bonusScheduleOpen(daily,at('2026-11-07T13:59:59.999-03:00')),false);
  assert.equal(bonusScheduleOpen(daily,at('2026-11-07T14:00:00-03:00')),true);
  assert.equal(bonusScheduleOpen(daily,at('2026-11-07T16:59:59.999-03:00')),true);
  assert.equal(bonusScheduleOpen(daily,at('2026-11-07T17:00:00-03:00')),false);
  assert.equal(bonusEnabled(rule,50000),true); assert.equal(bonusEnabled(rule,50000.01),false);
  assert.equal(creditAmounts(50000,50,0).bonus,25000);
});

test('el horario usa Paraguay aunque el dispositivo esté en otra zona',()=>{
  assert.equal(bonusScheduleOpen(daily,at('2026-11-07T17:00:00Z')),true);
  assert.equal(bonusScheduleOpen(daily,at('2026-11-07T20:00:00Z')),false);
  assert.equal(nextBonusScheduleChange([daily],at('2026-11-07T17:00:00Z')),at('2026-11-07T20:00:00Z'));
});

test('una franja que cruza medianoche pertenece al día en que empieza',()=>{
  const friday=parseBonusSchedule(true,'23:00','02:00',[5]);
  assert.equal(bonusScheduleOpen(friday,at('2026-11-06T23:00:00-03:00')),true);
  assert.equal(bonusScheduleOpen(friday,at('2026-11-07T01:59:59-03:00')),true);
  assert.equal(bonusScheduleOpen(friday,at('2026-11-07T02:00:00-03:00')),false);
  assert.equal(bonusScheduleOpen(friday,at('2026-11-07T23:00:00-03:00')),false);
  assert.equal(nextBonusScheduleChange([friday],at('2026-11-07T00:30:00-03:00')),at('2026-11-07T02:00:00-03:00'));
  assert.equal(nextBonusScheduleChange([friday],at('2026-11-07T02:00:00-03:00')),at('2026-11-13T23:00:00-03:00'));
  const sunday=parseBonusSchedule(true,'23:00','01:00',[7]);
  assert.equal(bonusScheduleOpen(sunday,at('2026-11-09T00:30:00-03:00')),true);
});

test('se despierta solo en la próxima apertura/cierre y no programa nada para bonos sin horario',()=>{
  const monday=parseBonusSchedule(true,'14:00','17:00',[1]);
  assert.equal(nextBonusScheduleChange([monday],at('2026-11-07T12:00:00-03:00')),at('2026-11-09T14:00:00-03:00'));
  assert.equal(nextBonusScheduleChange([daily],at('2026-11-07T17:00:00.020-03:00')),at('2026-11-08T14:00:00-03:00'));
  assert.equal(nextBonusScheduleChange([{}, {bonus_start_time:null,bonus_end_time:null}]),null);
  assert.equal(bonusScheduleOpen({}),true);
  assert.equal(bonusScheduleOpen({bonus_start_time:'14:00'}),false);
  assert.equal(bonusScheduleOpen({...daily,bonus_days:[]}),false);
});

test('rechaza horas iguales, segundos, días vacíos o inválidos y permite desactivar el horario',()=>{
  for(const [start,end,days] of [['14:00','14:00',[1]],['14:00:00','14:00',[1]],['24:00','17:00',[1]],['14:00:01','17:00',[1]],['14:00','17:00',[]],['14:00','17:00',[0]]]) assert.throws(()=>parseBonusSchedule(true,start,end,days));
  assert.deepEqual(parseBonusSchedule(true,'14:00','17:00',[7,1,1]).bonus_days,[1,7]);
  assert.equal(bonusScheduleText(daily),'Todos los días · 14:00–17:00 · hora de Paraguay');
  assert.equal(bonusScheduleOpen(parseBonusSchedule(false,'','',[])),true);
});

function reader() {
  const source=readFileSync(new URL('../supabase/functions/_shared/promotion-columns.ts',import.meta.url),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};vm.runInNewContext(output,{exports,require:()=>({bonusScheduleColumns})});return exports.readBonusScheduleColumns;
}

test('sin SQL de horarios conserva los límites actuales y recuerda la capacidad sin otra consulta fallida',async()=>{
  const read=reader(); const calls=[];
  const query=columns=>{calls.push(columns);return Promise.resolve(columns.includes('bonus_start_time')?{error:{message:'column promotions.bonus_start_time does not exist'}}:{data:[{min_amount:1000,max_amount:50000,load_number_from:1,cooldown_hours:0}],error:null});};
  const result=await read(query,'min_amount,max_amount,load_number_from,cooldown_hours');
  assert.equal(result.scheduleSupported,false);assert.equal(result.result.data[0].max_amount,50000);
  await read(query,'min_amount,max_amount,load_number_from,cooldown_hours');
  assert.equal(calls.length,3); assert.equal(calls[2],calls[1]);
});

test('un error de permisos o red no se disimula como compatibilidad con un esquema anterior',async()=>{
  const read=reader();let calls=0;
  const result=await read(()=>{calls++;return Promise.resolve({error:{message:'permission denied'}});},'id');
  assert.equal(result.result.error.message,'permission denied');assert.equal(calls,1);
});

async function submitAt(time, insertError = null, { reference = 'clear', insertThrows = false } = {}) {
  const counts={uploads:0,reservations:0,inserts:0,cleanups:0,references:0}; let handler;
  const id='10000000-0000-4000-8000-000000000001';
  const offer={...daily,reward_type:'cash',reward_label:'',bonus_mode:'percent',bonus_percent:50,bonus_amount:0,min_amount:1000,max_amount:50000,load_number_from:1,load_number_to:null,cooldown_hours:0};
  const db={
    from(table) {
      let insert=false; let referenceCheck=false;
      const query={select(){return query;},eq(field){if(field==='cloudinary_asset_id')referenceCheck=true;return query;},abortSignal(){return query;},gt(){return query;},limit(){return query;},maybeSingle(){return query;},single(){return query;},returns(){return query;},insert(){insert=true;counts.inserts++;return query;},
        then(resolve,reject){return Promise.resolve().then(()=>{
          if(insert && insertThrows) throw new Error('Lost response after commit');
          if(referenceCheck){counts.references++;return {data:reference==='found'?{id}:null,error:reference==='failed'?{message:'offline'}:null};}
          return table==='promotions'?{data:offer,error:null}:insert?{data:insertError?null:{id},error:insertError}:{data:null,error:null};
        }).then(resolve,reject);}};
      return query;
    },
    rpc(name){if(name==='reserve_receipt_upload')counts.reservations++;return Promise.resolve({data:name==='player_next_deposit_number'?1:0,error:null});},
  };
  class HttpError extends Error {}
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  const dependencies={
    '../_shared/bonus-schedule.ts':{bonusScheduleOpen:row=>bonusScheduleOpen(row,at(time))},
    '../_shared/promotion-columns.ts':{readBonusScheduleColumns:reader()},
    '../_shared/http.ts':{authenticate:async()=>({db,user:{id}}),serverClient:()=>db,HttpError,json,cors:{}},
    '../_shared/cloudinary.ts':{cloudName:()=> 'test-cloud',signedParams:async()=>new Map(),destroyReceipt:async()=>{counts.cleanups++;}},
    '../_shared/bonus-rule.ts':{asBonusRule,bonusEnabled},
    '../_shared/validation.ts':{assertFormFields,InputError,parseAmount,parseUuid,validateReceipt:async file=>file},
  };
  const source=readFileSync(new URL('../supabase/functions/submit-deposit/index.ts',import.meta.url),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(output,{exports:{},require:name=>{assert.ok(name in dependencies,name);return dependencies[name];},Deno:{serve:value=>{handler=value;}},console,Date,FormData,Response,Request,AbortSignal,crypto,
    fetch:async()=>{counts.uploads++;return json({public_id:'receipts/test',asset_id:'test',secure_url:'https://res.cloudinary.com/test-cloud/image/authenticated/test.jpg'});}});
  const form=new FormData();form.set('amount','50000');form.set('bonus_id',id);form.set('bank_assignment_id',id);form.set('receipt',new File(['test'],'test.png',{type:'image/png'}));
  const response=await handler(new Request('https://local.test/submit-deposit',{method:'POST',body:form}));
  return {counts,status:response.status,body:await response.json()};
}

test('la Edge rechaza el horario cerrado antes de reservar o subir un comprobante',async()=>{
  const result=await submitAt('2026-11-07T17:00:00-03:00');
  assert.equal(result.status,400); assert.match(result.body.error,/horario/);
  assert.deepEqual(result.counts,{uploads:0,reservations:0,inserts:0,cleanups:0,references:0});
});

test('si cierra durante la subida, se devuelve el error SQL y se limpia el comprobante sin registrar una carga sin bono',async()=>{
  const result=await submitAt('2026-11-07T16:59:59-03:00',{code:'P0001',message:'El bono está fuera de su horario disponible.'});
  assert.equal(result.status,400);assert.match(result.body.error,/horario/);
  assert.deepEqual(result.counts,{uploads:1,reservations:1,inserts:1,cleanups:1,references:1});
});

test('el envío dentro de horario conserva el camino existente y no borra el comprobante registrado',async()=>{
  const result=await submitAt('2026-11-07T14:00:00-03:00');
  assert.equal(result.status,201);assert.ok(result.body.request.id);
  assert.deepEqual(result.counts,{uploads:1,reservations:1,inserts:1,cleanups:0,references:0});
});


test('una respuesta de inserción perdida nunca borra el comprobante de una carga que pudo haberse guardado',async()=>{
  for(const options of [{error:{code:'',message:'Failed to fetch'},extra:{}},{error:null,extra:{insertThrows:true}}]) {
    const result=await submitAt('2026-11-07T14:00:00-03:00',options.error,options.extra);
    assert.equal(result.status,500);assert.equal(result.counts.cleanups,0);assert.equal(result.counts.references,0);
  }
});

test('un rechazo confirmado conserva la imagen si ya está referenciada o no se puede verificar',async()=>{
  for(const reference of ['found','failed']) {
    const result=await submitAt('2026-11-07T14:00:00-03:00',{code:'23505',message:'duplicate key'},{reference});
    assert.equal(result.counts.cleanups,0);assert.equal(result.counts.references,1);
  }
});
