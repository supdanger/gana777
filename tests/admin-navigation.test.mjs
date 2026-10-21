import assert from 'node:assert/strict';
import test from 'node:test';
import { needsChatReply, pendingChatCount, pendingRequestCount } from '../src/admin-navigation.ts';

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

test('una conversación queda pendiente si el último mensaje es del jugador', () => {
  const inbox = [
    { user_id: 'u1', last_sender_id: 'otro-cajero' },
    { user_id: 'u2', last_sender_id: 'u2' },
    { user_id: 'u3', last_sender_id: 'u3' },
  ];
  assert.equal(pendingChatCount(inbox), 2);
  assert.equal(needsChatReply(inbox[0]), false);
  assert.equal(needsChatReply(inbox[1]), true);
});
