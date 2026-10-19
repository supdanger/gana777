import assert from 'node:assert/strict';
import test from 'node:test';
import { pendingConversationCount, pendingRequestCount } from '../src/admin-navigation.ts';

test('cuenta solamente solicitudes pendientes del tipo indicado', () => {
  const base = { id: '1', user_id: 'u', user_name: '', amount: 1, created_at: '', approved_at: null, holder: null, cbu: null, alias: null, receipt_path: null, receipt_url: null, cloudinary_asset_id: null, bonus_id: null, bonus_percent: 0 };
  const requests = [
    { ...base, id: '1', kind: 'deposit', status: 'pending' },
    { ...base, id: '2', kind: 'withdrawal', status: 'pending' },
    { ...base, id: '3', kind: 'withdrawal', status: 'approved' },
  ];
  assert.equal(pendingRequestCount(requests, 'deposit'), 1);
  assert.equal(pendingRequestCount(requests, 'withdrawal'), 1);
});

test('una conversación queda pendiente cuando el último mensaje pertenece al usuario', () => {
  const messages = [
    { id: '1', user_id: 'u1', sender_id: 'u1', body: 'Hola', created_at: '2026-10-18T10:00:00Z' },
    { id: '2', user_id: 'u1', sender_id: 'admin', body: 'Respondido', created_at: '2026-10-18T10:01:00Z' },
    { id: '3', user_id: 'u2', sender_id: 'u2', body: 'Consulta', created_at: '2026-10-18T10:02:00Z' },
    { id: '4', user_id: 'u3', sender_id: 'admin', body: '¿Necesitás ayuda?', created_at: '2026-10-18T10:03:00Z' },
    { id: '5', user_id: 'u3', sender_id: 'u3', body: 'Sí', created_at: '2026-10-18T10:04:00Z' },
  ];
  assert.equal(pendingConversationCount(messages, 'admin'), 2);
});
