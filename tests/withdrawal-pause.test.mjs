import test from 'node:test';
import assert from 'node:assert/strict';
import { WITHDRAWAL_PAUSE_OPTIONS, validWithdrawalPause } from '../src/withdrawal-pause.ts';
test('solo se admiten los cuatro plazos acordados',()=>{
  assert.deepEqual(WITHDRAWAL_PAUSE_OPTIONS.map(v=>v.minutes),[15,120,360,720]);
  for(const value of [15,120,360,720]) assert.equal(validWithdrawalPause(value),true);
  for(const value of [-1,0,1,30,60,1440,15.5,Infinity,NaN]) assert.equal(validWithdrawalPause(value),false);
});
