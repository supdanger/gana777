import assert from 'node:assert/strict';
import test from 'node:test';
import { appendQuickReply, chatQuickReplies } from '../src/chat-quick-replies.ts';

test('agrega la plantilla sin sobrescribir el texto del operador', () => {
  assert.equal(appendQuickReply('', 'Hola'), 'Hola');
  assert.equal(appendQuickReply('Consulta en revisión.', 'Hola'), 'Consulta en revisión.\nHola');
});

test('el límite conserva el borrador en lugar de truncar una respuesta', () => {
  assert.equal(appendQuickReply('a'.repeat(1995), 'Hola'), 'a'.repeat(1995) + '\nHola');
  assert.equal(appendQuickReply('a'.repeat(1996), 'Hola'), null);
  assert.equal(appendQuickReply('a'.repeat(2000), 'Hola'), null);
  assert.ok(chatQuickReplies.every(reply => reply.body.length > 0 && reply.body.length <= 2000));
});
