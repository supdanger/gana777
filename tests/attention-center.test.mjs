import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import * as runtime from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import { canOpenAdminPage, noStaffPermissions } from '../src/staff.ts';

const source = readFileSync(new URL('../src/attention-center.tsx', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exports = {};
const dependencies = { 'react/jsx-runtime': runtime, 'lucide-react': icons, './staff': { canOpenAdminPage } };
vm.runInNewContext(output, { exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; } });
const render = (permissions, superAdmin = false) => renderToStaticMarkup(runtime.jsx(exports.AttentionCenter, { page: 'external-chat', counts: { chat: 11, externalChat: 3, access: 7 }, permissions, superAdmin, navigate() {}, children: 'Bandeja' }));

test('el centro de atención limita bandejas y contadores a los permisos del cajero', () => {
  const markup = render({ ...noStaffPermissions, external_chat: true });
  assert.match(markup, /Chat externo/);
  assert.match(markup, /<strong>3<\/strong> pendientes/);
  assert.doesNotMatch(markup, /Solicitudes de acceso|>Jugadores</);
  assert.equal((markup.match(/<button/g) || []).length, 1);
  assert.equal((render(noStaffPermissions).match(/<button/g) || []).length, 0);
});

test('el superadministrador conserva acceso a las tres bandejas', () => {
  const markup = render(noStaffPermissions, true);
  assert.match(markup, /<strong>21<\/strong> pendientes/);
  assert.equal((markup.match(/<button/g) || []).length, 3);
});
