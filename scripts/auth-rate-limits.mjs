import { pathToFileURL } from 'node:url';

export function parseLimit(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,3}$/.test(value)) throw new Error('Indicá un límite entero de 1 a 9999.');
  return Number(value);
}
async function authConfig(response) {
  try { return await response.json(); }
  catch { throw new Error('La API no devolvió una configuración válida. Verificá el Dashboard.'); }
}
export async function configureRateLimit({ token, project, limit, apply = false, request = fetch }) {
  if (!token) throw new Error('Falta SUPABASE_ACCESS_TOKEN: usá un token de gestión de Supabase, nunca una clave del navegador.');
  if (!/^[a-z0-9]{20}$/.test(project ?? '')) throw new Error('Falta un SUPABASE_PROJECT_REF válido.');
  if (apply && (!Number.isInteger(limit) || limit < 1 || limit > 9999)) throw new Error('Límite no válido.');
  const endpoint = `https://api.supabase.com/v1/projects/${project}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const current = await request(endpoint, { headers, signal: AbortSignal.timeout(15000) });
  if (!current.ok) throw new Error(`No se pudo leer la configuración de Auth (HTTP ${current.status}).`);
  const config = await authConfig(current);
  const previous = config.rate_limit_token_refresh;
  if (!apply) return { applied: false, limit: previous };
  const response = await request(endpoint, { method: 'PATCH', headers,
    body: JSON.stringify({ rate_limit_token_refresh: limit }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`No se pudo actualizar el límite de Auth (HTTP ${response.status}).`);
  const updated = await authConfig(response);
  if (Number(updated.rate_limit_token_refresh) !== limit) throw new Error('La API no confirmó el nuevo límite. Verificá el Dashboard antes de repetir.');
  return { applied: true, previous, limit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
      console.log('Lectura: npm run auth:limits\nAplicar: npm run auth:limits -- --apply --limit 60\nRequiere SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF en .env.auth.local.');
    } else {
      const apply = args.includes('--apply');
      const index = args.indexOf('--limit');
      const limit = index >= 0 ? parseLimit(args[index + 1]) : undefined;
      if (apply && limit === undefined) throw new Error('Indicá --limit antes de aplicar cambios.');
      let project = process.env.SUPABASE_PROJECT_REF;
      if (!project && process.env.VITE_SUPABASE_URL) project = new URL(process.env.VITE_SUPABASE_URL).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
      const result = await configureRateLimit({ token: process.env.SUPABASE_ACCESS_TOKEN, project, limit, apply });
      console.log(JSON.stringify(result)); // Never print full Auth configuration: it can contain secrets.
    }
  } catch (error) { console.error(error instanceof Error ? error.message : 'No se pudo configurar Auth.'); process.exitCode = 1; }
}
