import assert from 'node:assert/strict';
import test from 'node:test';
import { playerSignInEmail } from '../src/players.ts';

test('convierte el usuario del jugador a un correo interno', () => {
  assert.equal(playerSignInEmail('Juanito_17'), 'juanito_17@players.gana777.internal');
  assert.equal(playerSignInEmail('jugador@example.com'), 'jugador@example.com');
  assert.throws(() => playerSignInEmail('ab'));
  assert.throws(() => playerSignInEmail('usuario con espacios'));
});
