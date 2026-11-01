// El mismo formato lo interpreta public/external-chat-widget.js. Si cambia esta
// validación, hay que actualizar ese archivo para que el botón no acepte otra URL.
const ENTRY_PREFIX = '[[gana777-entrar]]\n';

const redirectOrigins = new Set([
  'https://gana777bet.com/',
  'https://www.gana777bet.com/',
  'https://gana777bet.online/',
  'https://gana777.vercel.app/',
  'http://localhost:5173/',
  'http://localhost:5174/',
  'http://localhost:5175/',
  'http://127.0.0.1:5173/',
  'http://127.0.0.1:5174/',
  'http://127.0.0.1:5175/',
  'http://[::1]:5173/',
  'http://[::1]:5174/',
  'http://[::1]:5175/',
]);

export function isEntryBody(body: string): boolean {
  return body.startsWith('[[gana777-entrar]]');
}

export function entryPreview(body: string): string {
  return isEntryBody(body) ? 'Entrar' : body;
}

export function entryLinkBody(actionLink: string): string {
  return `${ENTRY_PREFIX}${actionLink}`;
}

function allowedRedirect(value: string): boolean {
  let target: URL;
  try { target = new URL(value); } catch { return false; }
  if (target.username || target.password || target.search || target.hash) return false;
  if (target.pathname !== '/' && target.pathname !== '') return false;
  return redirectOrigins.has(`${target.origin}/`);
}

export function entryLinkUrl(body: string, verifyHost: string): string | null {
  if (!verifyHost || !body.startsWith(ENTRY_PREFIX)) return null;
  const raw = body.slice(ENTRY_PREFIX.length);
  if (!raw || raw.length > 1900 || /[\s<>"']/.test(raw)) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
  if (url.hostname.toLowerCase() !== verifyHost.toLowerCase()) return null;
  if (url.pathname !== '/auth/v1/verify') return null;
  const names = [...url.searchParams.keys()];
  if (names.length !== 3 || names.some(name => !['token', 'type', 'redirect_to'].includes(name))) return null;
  if (url.searchParams.get('type') !== 'magiclink') return null;
  const token = url.searchParams.get('token') ?? '';
  if (token.length < 8 || token.length > 1800) return null;
  if (!allowedRedirect(url.searchParams.get('redirect_to') ?? '')) return null;
  return raw;
}
