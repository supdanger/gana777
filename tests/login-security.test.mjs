import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginFailure, LOGIN_RETRY_SECONDS, readLoginRetryAt, saveLoginRetryAt } from '../src/login-security.ts';
import { configureRateLimit, parseLimit } from '../scripts/auth-rate-limits.mjs';

test('rate limited logins receive a retry delay without exposing account details', () => {
  const result = loginFailure({status:429,message:'private user detail'});
  assert.equal(result.retrySeconds,LOGIN_RETRY_SECONDS);
  assert.ok(!result.message.includes('private user detail'));
  assert.equal(loginFailure({code:'over_request_rate_limit'}).retrySeconds,60);
});
test('unknown users and invalid passwords produce the same public response', () => {
  assert.deepEqual(loginFailure({status:400,code:'invalid_credentials',message:'missing account'}),loginFailure({status:400,code:'invalid_credentials',message:'wrong password'}));
  assert.equal(loginFailure({status:400}).retrySeconds,0);
});
test('CAPTCHA errors ask for a fresh verification', () => {
  assert.match(loginFailure({code:'captcha_failed'}).message,/verificación/);
});
test('retry UX survives a refresh but does not trust arbitrary stored deadlines', () => {
  const data = new Map();
  globalThis.sessionStorage = {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  saveLoginRetryAt(50000);
  assert.equal(readLoginRetryAt(10000),50000);
  assert.equal(readLoginRetryAt(60000),0);
  saveLoginRetryAt(999999999);
  assert.equal(readLoginRetryAt(10000),0);
  saveLoginRetryAt(0);
  assert.equal(readLoginRetryAt(10000),0);
  delete globalThis.sessionStorage;
});
test('auth management tool only changes the requested rate field', async () => {
  const calls=[];
  const request=async (url,options) => {calls.push({url,options}); return {ok:true,json:async()=>({rate_limit_token_refresh: options.method==='PATCH'?60:150,security_captcha_secret:'must-never-be-returned'})};};
  const result=await configureRateLimit({token:'test-management-token',project:'abcdefghijklmnopqrst',limit:60,apply:true,request});
  assert.deepEqual(JSON.parse(calls[1].options.body),{rate_limit_token_refresh:60});
  assert.deepEqual(result,{applied:true,previous:150,limit:60});
  assert.ok(!JSON.stringify(result).includes('must-never-be-returned'));
});
test('auth management read-only mode performs no mutation', async () => {
  const methods=[];
  await configureRateLimit({token:'token',project:'abcdefghijklmnopqrst',request:async(_url,options)=>{methods.push(options.method??'GET');return {ok:true,json:async()=>({rate_limit_token_refresh:150})};}});
  assert.deepEqual(methods,['GET']);
  for (const value of ['0','-1','1;DROP TABLE users','1e3','99999',undefined]) assert.throws(()=>parseLimit(value));
});
test('malformed management responses do not leak configuration fragments', async () => {
  await assert.rejects(configureRateLimit({token:'token',project:'abcdefghijklmnopqrst',request:async()=>({ok:true,json:async()=>{throw new SyntaxError('secret-config-fragment');}})}),error=>!error.message.includes('secret-config-fragment'));
});
