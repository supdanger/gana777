import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compressedReceiptName, readableFileSize, scaledDimensions } from '../src/image-compression.ts';

test('scales large receipts without changing their aspect ratio', () => {
  assert.deepEqual(scaledDimensions(1080, 2400), { width: 922, height: 2048 });
  assert.deepEqual(scaledDimensions(800, 1200), { width: 800, height: 1200 });
});

test('uses a safe JPEG name and displays the optimized size', () => {
  assert.equal(compressedReceiptName('transferencia.png'), 'transferencia.jpg');
  assert.equal(compressedReceiptName('archivo'), 'archivo.jpg');
  assert.equal(readableFileSize(1536), '2 KB');
  assert.equal(readableFileSize(1572864), '1,5 MB');
});
