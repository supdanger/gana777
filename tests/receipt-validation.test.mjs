import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, validateReceipt } from '../supabase/functions/_shared/validation.ts';
import { signature, storedReceipt } from '../supabase/functions/_shared/cloudinary.ts';
import { createHash } from 'node:crypto';

test('accepts ARS decimals with a comma or period without floating point rejection', () => {
  assert.equal(parseAmount('123,45'), 123.45);
  assert.equal(parseAmount('0.29'), 0.29);
  assert.equal(parseAmount('50000'), 50000);
  assert.equal(parseAmount('50.000,00'), 50000);
  assert.equal(parseAmount('10.000'), 10000);
  assert.equal(parseAmount('10.001'), 10001);
});
test('rejects invalid, ambiguous and out of range amounts', () => {
  for (const value of ['', '-1', '0', '1e4', 'Infinity', '1000000000', '0x10', '10.000.50', '1'.repeat(30)]) assert.throws(() => parseAmount(value));
});
test('requires matching file bytes instead of trusting the MIME type', async () => {
  await assert.rejects(validateReceipt(new File(['<script>bad</script>'], 'image.png', { type: 'image/png' })));
  const image = new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0])], 'receipt.png', { type: 'image/png' });
  assert.equal(await validateReceipt(image), image);
});
test('rejects empty and oversized files', async () => {
  await assert.rejects(validateReceipt(new File([], 'empty.jpg', { type: 'image/jpeg' })));
  await assert.rejects(validateReceipt(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })));
});
test('reads only an authenticated receipt stored for this cloud', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const file = '22222222-2222-4222-8222-222222222222';
  const stored = `https://res.cloudinary.com/demo/image/authenticated/s--abcdefgh--/v1710000000/receipts/${id}/${file}.png`;
  assert.deepEqual(storedReceipt(stored, 'demo'), { publicId: `receipts/${id}/${file}`, format: 'png' });
  assert.deepEqual(storedReceipt(stored.replace('.png', '.jpeg'), 'demo'), { publicId: `receipts/${id}/${file}`, format: 'jpg' });
  for (const value of [
    stored.replace('/demo/', '/other/'),
    stored.replace('/authenticated/', '/upload/'),
    `${stored}?download=1`,
    stored.replace(`/receipts/${id}/`, '/receipts/../'),
    'https://evil.example/image/authenticated/v1/receipts/a/b.png',
  ]) assert.equal(storedReceipt(value, 'demo'), null);
});
test('signs sorted parameters without leaking the secret into the result', async () => {
  const params = { type: 'authenticated', timestamp: '1700000000', public_id: 'receipts/user/file' };
  const expected = createHash('sha1').update('public_id=receipts/user/file&timestamp=1700000000&type=authenticatedtest-secret').digest('hex');
  assert.equal(await signature(params, 'test-secret'), expected);
});
