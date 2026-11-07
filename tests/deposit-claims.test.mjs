import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { cachedResource, clearResourceCache } from '../src/resource-cache.ts';
import { InputError } from '../supabase/functions/_shared/validation.ts';

function moduleWith(respond) {
  const calls=[];
  const supabase={ rpc(name,args) { const call={name,args}; calls.push(call); const promise=Promise.resolve().then(()=>respond(call)); promise.abortSignal=signal=>{call.signal=signal;return promise;}; return promise; } };
  const source=readFileSync(new URL('../src/deposit-claims.ts',import.meta.url),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(output,{exports,require(name){ if(name==='./lib') return {supabase}; if(name==='./resource-cache') return {cachedResource}; if(name.endsWith('/validation')) return {InputError}; throw new Error(name); }});
  return {...exports,calls};
}

test('la capacidad se comparte por sesión y solo la ausencia de RPC conserva el flujo anterior',async()=>{
  clearResourceCache();
  const api=moduleWith(()=>({data:1,error:null}));
  assert.deepEqual(await Promise.all([api.depositQueueEnabled('a'),api.depositQueueEnabled('a')]),[true,true]);
  assert.equal(api.calls.length,1);
  clearResourceCache();
  const legacy=moduleWith(()=>({error:{code:'PGRST202',message:'missing'}}));
  assert.equal(await legacy.depositQueueEnabled('a'),false);
  clearResourceCache();
  const denied=moduleWith(()=>({error:{code:'42501',message:'denied'}}));
  await assert.rejects(()=>denied.depositQueueEnabled('a'),error=>error.code==='42501');
  clearResourceCache();
});

test('los filtros se envían al servidor y una lectura cancelada no pierde la señal',async()=>{
  const api=moduleWith(()=>({data:{rows:[],total:75,pending_count:30}}));
  const signal=new AbortController().signal;
  assert.equal((await api.readDepositQueue('mine',2,signal)).total,75);
  assert.equal(api.calls[0].name,'list_deposit_queue');
  assert.equal(api.calls[0].args.p_filter,'mine');
  assert.equal(api.calls[0].args.p_page,2);
  assert.equal(api.calls[0].signal,signal);
});

test('todas las mutaciones posteriores a la toma llevan su token, incluso al reintentar acreditar',async()=>{
  const api=moduleWith(()=>({data:{id:'r',status:'approved'}}));
  const row={id:'r',claim_token:'version-1',claimed_by:'a'};
  await api.releaseDeposit(row);
  await api.reassignDeposit(row,'Revisión del responsable');
  await api.reviewQueueDeposit(row,'approved',1200,false);
  await api.confirmQueueCredit(row);
  assert.ok(api.calls.every(call=>call.args.p_request_id==='r' && call.args.p_token==='version-1'));
  assert.equal(api.calls[2].args.p_actual_amount,1200);
  assert.equal(api.calls[2].args.p_apply_bonus,false);
});

test('un conflicto de toma no se convierte en una asignación local ni habilita el trabajo',async()=>{
  const api=moduleWith(()=>({error:{code:'P0001',message:'La carga ya fue tomada por otro compañero. Actualizá la bandeja.'}}));
  await assert.rejects(()=>api.takeDeposit('r'),error=>error instanceof InputError && /otro compañero/.test(error.message));
  assert.equal(api.ownsDeposit({claimed_by:'b',claim_token:'token'},'a'),false);
  assert.equal(api.ownsDeposit({claimed_by:'a'},'a'),false);
  assert.equal(api.ownsDeposit({claimed_by:'a',claim_token:'token'},'a'),true);
  assert.equal(api.depositClaimLabel({status:'approved',claimed_by:null},'a'),'Cargada');
  assert.equal(api.depositClaimLabel({status:'pending',claimed_by:null},'a'),'Disponible');
  assert.equal(api.depositClaimLabel({status:'pending',claimed_by:'b',claimed_name:'Bea',claim_token:'t'},'a'),'En atención por Bea');
});
