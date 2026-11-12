import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminLiveBatch } from '../src/admin-live-batch.ts';
function setup() {
  const events=[]; const pending=new Map(); let next=0,shown=true;
  const batch=createAdminLiveBatch({emit:scopes=>events.push(scopes),visible:()=>shown,schedule:run=>{pending.set(++next,run);return next},cancel:key=>pending.delete(key)});
  return {batch,events,pending,hide:()=>shown=false,show:()=>shown=true,run(){const tasks=[...pending.values()];pending.clear();tasks.forEach(run=>run())}};
}
test('200 avisos de la misma sección se agrupan sin consultas periódicas',()=>{
  const s=setup();s.batch.observe('chat',0,true);assert.equal(s.pending.size,0);
  for(let v=1;v<=200;v++)s.batch.observe('chat',v);
  s.batch.observe('withdrawal',1);assert.equal(s.pending.size,1);s.run();
  assert.deepEqual(s.events,[['chat','withdrawal']]);assert.equal(s.pending.size,0);
});
test('no repite versiones y recupera cambios perdidos al reconectar',()=>{
  const s=setup();s.batch.observe('chat',12,true);s.batch.observe('chat',12);s.batch.observe('chat',11);assert.equal(s.pending.size,0);
  s.batch.observe('chat',15,true);s.run();assert.deepEqual(s.events,[['chat']]);
});
test('conserva los cambios en segundo plano y realiza una sola actualización al volver',()=>{
  const s=setup();s.hide();for(let n=1;n<100;n++)s.batch.observe('deposit',n);assert.equal(s.pending.size,0);
  s.show();s.batch.wake();s.run();assert.deepEqual(s.events,[['deposit']]);
});
test('no pierde un aviso si se oculta antes de ejecutar el grupo',()=>{
  const s=setup();s.batch.observe('chat',1);s.hide();s.run();assert.equal(s.events.length,0);
  s.show();s.batch.wake();s.run();assert.equal(s.events.length,1);s.batch.observe('chat',2);s.batch.stop();s.run();assert.equal(s.events.length,1);
});
