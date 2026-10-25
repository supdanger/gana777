import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultHeaderLogoLayout, headerLogoLayout, headerLogoStyle, normalizeHeaderLogoLayout } from '../src/header-logo-layout.ts';

test('el logo del encabezado conserva un encuadre por tema y limita sus medidas', () => {
  const settings = { portal_header_logo_layouts: { christmas: { width: 180, height: 55, scale: 135, x: 12, y: -6 } } };
  assert.deepEqual(headerLogoLayout(settings, 'christmas'), { width: 180, height: 55, scale: 135, x: 12, y: -6 });
  assert.deepEqual(headerLogoLayout(settings, 'base'), defaultHeaderLogoLayout);
  assert.deepEqual(normalizeHeaderLogoLayout({ width: 999, height: -1, scale: Infinity, x: -999 }), { width: 320, height: 20, scale: 100, x: -120, y: 0 });
  assert.equal(headerLogoStyle(headerLogoLayout(settings, 'christmas'))['--portal-logo-scale'], 1.35);
});
