import assert from 'node:assert/strict';
import test from 'node:test';
import { entryLinkBody, entryLinkUrl, entryPreview, isEntryBody } from '../src/entry-link.ts';

const host = 'projectrefprojectref.supabase.co';
const portal = 'https://gana777bet.online/';
const link = `https://${host}/auth/v1/verify?token=aaaaaaaa&type=magiclink&redirect_to=${encodeURIComponent(portal)}`;

test('acepta enlaces cortos solo en portales permitidos y con secreto completo', () => {
  const token = 'aBcD0123456789_-aBcD0123456789_-ab'.slice(0, 32);
  assert.equal(token.length, 32);
  const short = `${portal}#e=${token}`;
  assert.equal(entryLinkUrl(entryLinkBody(short), host), short);
  for (const bad of [`https://evil.example/#e=${token}`, `${portal}otra#e=${token}`, `${portal}?next=evil#e=${token}`, `${portal}#e=short`, `${short}&extra=1`]) {
    assert.equal(entryLinkUrl(entryLinkBody(bad), host), null);
  }
});

test('un ingreso válido se muestra como Entrar y conserva la URL solo para el botón', () => {
  const body = entryLinkBody(link);
  assert.equal(isEntryBody(body), true);
  assert.equal(entryPreview(body), 'Entrar');
  assert.equal(entryLinkUrl(body, host), link);
  assert.equal(entryPreview('Hola'), 'Hola');
  assert.equal(entryLinkUrl('Hola', host), null);
});

test('rechaza direcciones que no son el ingreso de este proyecto', () => {
  const cases = [
    `https://otro.supabase.co/auth/v1/verify?token=aaaaaaaa&type=magiclink&redirect_to=${encodeURIComponent(portal)}`,
    `http://${host}/auth/v1/verify?token=aaaaaaaa&type=magiclink&redirect_to=${encodeURIComponent(portal)}`,
    `https://usuario:clave@${host}/auth/v1/verify?token=aaaaaaaa&type=magiclink&redirect_to=${encodeURIComponent(portal)}`,
    `https://${host}/auth/v1/verify/extra?token=aaaaaaaa&type=magiclink&redirect_to=${encodeURIComponent(portal)}`,
    `https://${host}/auth/v1/verify?token=aaaaaaaa&type=recovery&redirect_to=${encodeURIComponent(portal)}`,
    `https://${host}/auth/v1/verify?token=short&type=magiclink&redirect_to=${encodeURIComponent(portal)}`,
    `https://${host}/auth/v1/verify?token=aaaaaaaa&type=magiclink&redirect_to=${encodeURIComponent('https://evil.example/')}`,
    `https://${host}/auth/v1/verify?token=aaaaaaaa&type=magiclink&redirect_to=${encodeURIComponent('https://gana777bet.online/otra')}`,
    `https://${host}/auth/v1/verify?token=aaaaaaaa&type=magiclink&redirect_to=${encodeURIComponent(portal)}&next=https://evil.example`,
    `javascript:alert(1)`,
  ];
  for (const value of cases) assert.equal(entryLinkUrl(entryLinkBody(value), host), null);
  assert.equal(entryLinkUrl(entryLinkBody(link), ''), null);
  assert.equal(entryLinkUrl(`[[gana777-entrar]] ${link}`, host), null);
  assert.equal(entryPreview(entryLinkBody(cases[0])), 'Entrar');
});

test('acepta el portal local que usa el panel en desarrollo', () => {
  const local = `https://${host}/auth/v1/verify?token=bbbbbbbb&type=magiclink&redirect_to=${encodeURIComponent('http://localhost:5174/')}`;
  assert.equal(entryLinkUrl(entryLinkBody(local), host), local);
});
