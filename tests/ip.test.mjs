import assert from 'node:assert/strict';
import test from 'node:test';
import { requestIp } from '../supabase/functions/_shared/ip.ts';

test('registra únicamente direcciones IP válidas observadas por el proxy', () => {
  assert.equal(requestIp(new Headers({ 'cf-connecting-ip': '203.0.113.41' })), '203.0.113.41');
  assert.equal(requestIp(new Headers({ 'x-real-ip': '2001:db8::1' })), '2001:db8::1');
  assert.equal(requestIp(new Headers({ 'x-forwarded-for': '198.51.100.8, 10.0.0.1' })), '198.51.100.8');
  assert.equal(requestIp(new Headers({ 'cf-connecting-ip': '999.1.2.3' })), null);
  assert.equal(requestIp(new Headers({ 'x-real-ip': 'bad:::ip' })), null);
  assert.equal(requestIp(new Headers()), null);
});
