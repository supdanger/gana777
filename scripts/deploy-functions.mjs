import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRefFile = join(projectRoot, 'supabase', '.temp', 'project-ref');
const cli = join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'supabase.cmd' : 'supabase');

if (!existsSync(projectRefFile)) throw new Error('Primero vinculá el proyecto con: npx supabase link --project-ref TU_PROJECT_REF');
if (!existsSync(cli)) throw new Error('No se encontró Supabase CLI. Ejecutá npm install.');

const projectRef = readFileSync(projectRefFile, 'utf8').trim();
if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error('El project ref vinculado no es válido.');

const stagingRoot = mkdtempSync(join(tmpdir(), 'gana777-functions-'));
const stagingSupabase = join(stagingRoot, 'supabase');

try {
  // Supabase empaqueta dentro de un contenedor con otro usuario. mkdtemp crea
  // la raíz con 0700, por lo que debemos permitirle atravesarla y leerla.
  chmodSync(stagingRoot, 0o755);
  mkdirSync(stagingSupabase, { recursive: true });
  cpSync(join(projectRoot, 'supabase', 'functions'), join(stagingSupabase, 'functions'), { recursive: true });
  cpSync(join(projectRoot, 'supabase', 'config.toml'), join(stagingSupabase, 'config.toml'));

  for (const functionName of ['manage-players', 'manage-cashiers']) {
    console.log(`\nDesplegando ${functionName}…`);
    const result = spawnSync(cli, [
      'functions', 'deploy', functionName,
      '--project-ref', projectRef,
      '--no-verify-jwt',
      '--use-api',
    ], { cwd: stagingRoot, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
    if (process.exitCode) break;
  }
} finally {
  rmSync(stagingRoot, { recursive: true, force: true });
}
