import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVercelBuildMode } from '../scripts/build-vercel.mjs';

test('Vercel compila cada repositorio con el modo correcto', () => {
  assert.equal(resolveVercelBuildMode({ VERCEL_GIT_REPO_SLUG: 'gana777panel' }), 'admin');
  assert.equal(resolveVercelBuildMode({ VERCEL_GIT_REPO_SLUG: 'gana777' }), 'user');
  assert.equal(resolveVercelBuildMode({ VERCEL_PROJECT_PRODUCTION_URL: 'gana777panel.vercel.app' }), 'admin');
  assert.equal(resolveVercelBuildMode({ VERCEL_PROJECT_PRODUCTION_URL: 'gana777.vercel.app' }), 'user');
  assert.throws(() => resolveVercelBuildMode({ VERCEL_GIT_REPO_SLUG: 'otro' }), /no reconocido/);
  assert.throws(() => resolveVercelBuildMode({}), /No se pudo identificar/);
});
