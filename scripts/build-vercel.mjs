import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function resolveVercelBuildMode(environment) {
  const repo = environment.VERCEL_GIT_REPO_SLUG?.toLowerCase();
  if (repo === 'gana777panel') return 'admin';
  if (repo === 'gana777') return 'user';
  if (repo) throw new Error(`Repositorio de Vercel no reconocido: ${repo}`);

  const productionHost = environment.VERCEL_PROJECT_PRODUCTION_URL?.toLowerCase();
  const deploymentHost = environment.VERCEL_URL?.toLowerCase();
  if (productionHost?.startsWith('gana777panel.') || deploymentHost?.startsWith('gana777panel-')) return 'admin';
  if (productionHost?.startsWith('gana777.') || deploymentHost?.startsWith('gana777-')) return 'user';
  throw new Error('No se pudo identificar si Vercel está compilando el portal o el panel. Activá las variables de sistema de Vercel.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const mode = resolveVercelBuildMode(process.env);
  const command = mode === 'admin' ? 'build:admin' : 'build';
  console.log(`Compilando ${mode === 'admin' ? 'panel administrativo' : 'portal de jugadores'} con npm run ${command}`);
  const result = spawnSync('npm', ['run', command], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
