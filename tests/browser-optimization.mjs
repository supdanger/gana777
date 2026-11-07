// Optional browser smoke test. Start both production previews first. All remote
// HTTP and websocket traffic is intercepted; this never calls the live database.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, globSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright').catch(async error => {
  const cached = globSync(`${homedir()}/.npm/_npx/*/node_modules/playwright/index.mjs`)[0];
  if (!cached) throw error;
  return import(pathToFileURL(cached).href);
});
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const projectUrl = env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
assert.ok(projectUrl, 'Configure the public Supabase URL for this local smoke test');
const storageKey = `sb-${new URL(projectUrl).hostname.split('.')[0]}-auth-token`;
const uid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const stamp = n => new Date(Date.UTC(2026, 10, 7, 12, 0, n)).toISOString();
const account = admin => ({ id: uid(admin ? 9000 : 1), aud: 'authenticated', role: 'authenticated', email: admin ? 'admin@example.test' : 'player@players.gana777.internal', user_metadata: { display_name: admin ? 'Operador prueba' : 'Jugador prueba' }, app_metadata: { provider: 'email', providers: ['email'] }, created_at: stamp(0), last_sign_in_at: stamp(0) });
const session = (admin, sessionNow = Date.now()) => {
  const user = account(admin);
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: Math.floor(sessionNow / 1000) + 3600 })}.test`, refresh_token: 'local-test', expires_in: 3600, expires_at: Math.floor(sessionNow / 1000) + 3600, token_type: 'bearer', user };
};
const settings = { id: true, portal_theme: 'modern', portal_theme_designs: {}, login_image_path: 'brand/panda-login-transparent.png', home_banner_enabled: false, home_banners_visible: false, home_tutorial_enabled: false, home_tutorial_first_login_enabled: false, wheel_enabled: false, show_whatsapp: false, show_telegram: false, show_instagram: false };
const requestRows = Array.from({ length: 130 }, (_, i) => ({ id: uid(1000 + i), user_id: uid(1), user_name: `Jugador ${i}`, kind: i % 3 === 0 ? 'deposit' : 'withdrawal', amount: 1000 + i, status: i < 35 ? 'pending' : 'approved', created_at: stamp(i), approved_at: i < 35 ? null : stamp(i + 60), holder: 'Jugador Prueba', cbu: '0123456789012345678901', alias: null, receipt_path: null, receipt_url: null, bonus_percent: 0, bonus_amount: 0, bonus_id: null }));
const players = Array.from({ length: 125 }, (_, i) => ({ user_id: uid(200 + i), username: `jugador${i}`, display_name: `Jugador ${i}`, phone: `595981${String(i).padStart(6, '0')}`, external_user_id: `externo${i}`, created_at: stamp(i), deposits: 3, withdrawals: 1, whatsapp_principal_slot: 1, whatsapp_principal_phone: '595981111111', referrer_user_id: null, referrer_name: null }));
const chats = Array.from({ length: 145 }, (_, i) => ({ user_id: uid(300 + i), username: `chat${i}`, display_name: `Chat ${i}`, last_message_id: uid(5000 + i), last_sender_id: i % 4 === 0 ? uid(9000) : uid(300 + i), last_body: `Consulta ${i}`, last_created_at: stamp(i), completed_at: i % 9 === 0 ? stamp(i) : null, completed_by: null, last_source: 'app' }));
const external = Array.from({ length: 80 }, (_, i) => ({ thread_id: uid(700 + i), nickname: `Poker${i}`, origin: 'https://gana777bet.com', created_at: stamp(i), last_seen_at: stamp(i), last_message_id: uid(6000 + i), last_sender_type: 'visitor', last_body: `Consulta externa ${i}`, last_message_at: stamp(i), completed_at: null, completed_by: null }));
const records = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || globSync(`${homedir()}/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell`)[0] });
mkdirSync('/tmp/gana777-browser-checks', { recursive: true });
async function openApp(admin, mobile = false, queue = null, bonusPlan = null) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: session(admin, bonusPlan?.now ? Date.parse(bonusPlan.now) : Date.now()) });
  await context.routeWebSocket('**/*', socket => socket.close());
  const calls = [];
  const errors = [];
  await context.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.origin !== new URL(projectUrl).origin) return route.abort();
    calls.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), method: req.method() });
    let body = [];
    let total = 0;
    let single = false;
    const resource = url.pathname.split('/').at(-1);
    if (url.pathname.includes('/auth/v1/')) body = resource === 'user' ? account(admin) : session(admin);
    else if (url.pathname.includes('/functions/')) body = { ok: true, pending_count: 0, requests: [] };
    else if (url.pathname.includes('/storage/')) return route.abort();
    else if (url.pathname.includes('/rpc/')) {
      if (resource === 'get_deposit_queue_mode' && queue) body = 1;
      else if (queue && ['list_deposit_queue','take_deposit','release_deposit','review_queue_deposit','confirm_queue_deposit_credit','reassign_deposit','list_deposit_claim_events'].includes(resource)) {
        const args = req.postDataJSON();
        const row = queue.rows.find(row => row.id === args.p_request_id);
        const actor = uid(9000);
        const fail = message => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message }) });
        if (resource === 'list_deposit_queue') {
          let rows = queue.rows.filter(row => row.status !== 'rejected' && !row.credited_at);
          rows = rows.filter(row => args.p_filter === 'all' || args.p_filter === 'mine' && row.claimed_by === actor || args.p_filter === 'available' && row.status === 'pending' && !row.claimed_by);
          body = { total: rows.length, pending_count: queue.rows.filter(row => row.status === 'pending').length, rows: rows.slice(args.p_page * 30, args.p_page * 30 + 30) };
        } else if (resource === 'list_deposit_claim_events') body = queue.events.filter(event => event.request_id === args.p_request_id);
        else if (resource === 'take_deposit') {
          if (queue.failNextTake) { queue.failNextTake = false; return fail('La carga ya fue tomada por otro compañero. Actualizá la bandeja.'); }
          if (row.claimed_by && row.claimed_by !== actor) return fail('La carga ya fue tomada por otro compañero. Actualizá la bandeja.');
          if (!row.claimed_by) { row.claimed_by = actor; row.claimed_name = 'Operador prueba'; row.claim_token = uid(++queue.version); row.claimed_at = stamp(0); }
          body = row;
        } else {
          if (args.p_token !== (row.claim_token ?? null)) return fail('La asignación de esta carga cambió. Volvé a abrirla.');
          if (resource === 'release_deposit') { row.claimed_by = null; row.claim_token = null; row.claimed_at = null; body = null; }
          if (resource === 'reassign_deposit') { row.claimed_by = actor; row.claimed_name = 'Operador prueba'; row.claim_token = uid(++queue.version); row.claimed_at = stamp(0); body = row; }
          if (resource === 'review_queue_deposit') { if (queue.reviewBarrier) await queue.reviewBarrier; row.status = args.p_status; row.credit_started_at = stamp(0); body = row; }
          if (resource === 'confirm_queue_deposit_credit') { row.credited_at = stamp(0); body = { notification_id: uid(9900), newly_credited: false }; }
          queue.events.push({ request_id: row.id, event: resource === 'reassign_deposit' ? 'reassigned' : resource === 'review_queue_deposit' ? args.p_status : 'taken', actor_name: 'Operador prueba', created_at: stamp(0), reason: args.p_reason });
        }
      }
      else if (resource === 'get_deposit_queue_mode') return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Function not available in legacy fixture' }) });
      else if (resource === 'is_admin') body = admin;
      else if (resource === 'get_admin_context') { body = { is_super_admin: true, username: 'admin', display_name: 'Operador prueba', avatar_path: null, permissions: {} }; single = true; }
      else if (resource === 'get_my_session_revoked_at') body = null;
      else if (resource === 'get_my_whatsapp_url') body = 'https://wa.me/595981111111';
      else if (resource === 'player_next_deposit_number') body = 4;
      else if (resource === 'get_bank_operation_status') { body = { mode: 'online', resumes_at: null, active_shift_key: 'morning' }; single = true; }
      else if (resource === 'get_bonus_counter_dashboard') body = { active: { id: 1, started_at: stamp(0), summary: { counters: [{ key: 'fixed-1000', title: 'Bono + $1.000', loads: 41, bonusTotal: 41000 }, { key: 'fixed-2500', title: 'Bono + $2.500', loads: 17, bonusTotal: 42500 }, { key: 'none', title: 'Sin bono', loads: 11, bonusTotal: 0 }, { key: 'percent-100', title: 'Bono 100%', loads: 6, bonusTotal: 30000 }], totalLoads: 75, withoutBonus: 11, totalBonusGranted: 113500, freeSpinsGranted: 0 } }, history: [] };
      else if (resource === 'assign_bank_account') { body = { assignment_id: uid(999), id: uid(998), bank: 'Banco prueba', holder: 'Prueba Banco', cbu: '0123456789012345678901', alias: 'prueba.banco' }; single = true; }
    } else {
      if (resource === 'promotions') {
        if (!bonusPlan && url.searchParams.get('select')?.includes('bonus_start_time')) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '42703', message: 'column promotions.bonus_start_time does not exist' }) });
        if (bonusPlan) {
          if (req.method() === 'POST') { const row = { image_path: null, image_layout: 'image', deposit_image_path: null, ...req.postDataJSON(), id: uid(24000 + bonusPlan.offers.length) }; bonusPlan.offers.push(row); bonusPlan.saved = row; }
          if (req.method() === 'PATCH') { const row = bonusPlan.offers.find(row => `eq.${row.id}` === url.searchParams.get('id')); if (row) Object.assign(row, req.postDataJSON()); }
          body = [...bonusPlan.offers];
        }
      }
      else if (resource === 'app_settings') body = [settings];
      else if (resource === 'user_profiles') body = [{ user_id: uid(1), username: 'jugador', display_name: 'Jugador prueba' }];
      else if (resource === 'player_casino_links') body = [{ user_id: uid(1), url: 'https://example.test/casino' }];
      else if (resource === 'player_directory') {
        body = [...players];
        const search = url.searchParams.get('or');
        if (search) body = body.filter(row => [row.username, row.display_name, row.external_user_id, row.phone].some(value => search.includes(`*${value}*`)));
      } else if (resource === 'whatsapp_principals') body = [{ slot: 1, phone: '595981111111', active: true }];
      else if (resource === 'request_summaries') body = bonusPlan && !admin ? requestRows.filter(row => row.kind !== 'deposit' || row.status !== 'pending') : [...requestRows];
      else if (resource === 'chat_inbox') body = [...chats];
      else if (resource === 'external_chat_inbox') body = [...external];
      else if (resource === 'withdrawal_parts') {
        const idFilter = url.searchParams.get('request_id') || '';
        body = requestRows.filter(row => row.kind === 'withdrawal' && idFilter.includes(row.id)).flatMap(row => Array.from({ length: 100 }, (_, i) => ({ request_id: row.id, part_number: i + 1, amount: 1000, paid_at: null, receipt_path: null })));
      } else if (resource === 'unified_chat_messages' || resource === 'external_chat_messages') {
        const id = url.searchParams.get(resource === 'unified_chat_messages' ? 'user_id' : 'thread_id')?.replace('eq.', '') || uid(1);
        body = Array.from({ length: 120 }, (_, i) => ({ id: uid(8000 + i), user_id: id, thread_id: id, sender_id: i % 2 ? uid(9000) : id, sender_type: i % 2 ? 'staff' : 'visitor', body: `Mensaje ${i}`, attachment_path: null, created_at: stamp(i), source: 'app' }));
        const cursor = url.searchParams.get('or');
        if (cursor) { const older = cursor.match(/created_at\.lt\.([^,]+)/)?.[1]; if (older) body = body.filter(row => row.created_at < older); }
      }
      for (const [field, expression] of url.searchParams) {
        if (expression.startsWith('eq.')) body = body.filter(row => String(row[field]) === expression.slice(3));
        if (expression.startsWith('neq.')) body = body.filter(row => String(row[field]) !== expression.slice(4));
        if (expression.startsWith('in.(')) { const ids = expression.slice(4, -1).split(','); body = body.filter(row => ids.includes(String(row[field]))); }
      }
      const order = url.searchParams.get('order') || '';
      const first = order.split(',')[0];
      if (first) { const [field, direction] = first.split('.'); body.sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * (direction === 'desc' ? -1 : 1)); }
      total = body.length;
      const from = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || 1000);
      body = body.slice(from, from + limit);
      if (req.headers().accept?.includes('application/vnd.pgrst.object+json')) { body = body[0] ?? null; single = true; }
    }
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Content-Range', 'content-range': `0-${Math.max(0, total - 1)}/${total}` };
    if (single) headers['content-type'] = 'application/vnd.pgrst.object+json';
    return route.fulfill({ status: 200, headers, body: req.method() === 'HEAD' ? '' : JSON.stringify(body) });
  });
  const page = await context.newPage();
  if (bonusPlan?.now) await page.clock.install({ time: new Date(bonusPlan.now) });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(admin ? (process.env.ADMIN_PREVIEW_URL || 'http://127.0.0.1:5181') : (process.env.USER_PREVIEW_URL || 'http://127.0.0.1:5180'));
  try { await page.waitForSelector(admin ? '.admin-shell' : '.user-app', { timeout: 20000 }); }
  catch (error) { console.error(JSON.stringify({ text: await page.locator('body').innerText(), errors, calls }, null, 2)); await page.screenshot({ path: '/tmp/gana777-browser-checks/failure.png', fullPage: true }); throw error; }
  return { context, page, calls, errors };
}
try {
  const { context, page, calls, errors } = await openApp(false, true);
  await page.waitForSelector('.action-card');
  assert.equal(calls.filter(call => call.path.endsWith('/unified_chat_messages')).length, 0, 'El inicio no descarga mensajes');
  assert.equal(calls.filter(call => call.path.endsWith('/withdrawal_parts')).length, 0, 'El inicio no descarga partes de retiros');
  assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => /admin-shell.*\.css/.test(entry.name))), false, 'El portal no descarga estilos del panel');
  const before = calls.length;
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await page.getByRole('button', { name: /Historial de cargas/ }).click();
  await page.waitForSelector('.movement');
  assert.ok(await page.locator('.movement').count() <= 5);
  const history = calls.slice(before).filter(call => call.path.endsWith('/request_summaries'));
  assert.ok(history.some(call => call.query.limit === '5'));
  await page.getByRole('button', { name: 'Volver al inicio', exact: true }).click();
  await page.getByRole('button', { name: /^Chat/ }).click();
  await page.waitForSelector('.player-chat-log .message');
  assert.equal(await page.locator('.player-chat-log .message').count(), 50);
  await page.getByRole('button', { name: 'Ver mensajes anteriores', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.player-chat-log .message').length === 100);
  await page.getByRole('button', { name: 'Cerrar chat', exact: true }).click();
  await page.screenshot({ path: '/tmp/gana777-browser-checks/player-home.png', fullPage: true });
  await page.getByRole('button', { name: /^Cargar/ }).click();
  await page.waitForSelector('.request-form, form');
  assert.equal(await page.locator('.alert.error').count(), 0);
  const publicCache = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('gana777:public-content:')).map(key => localStorage.getItem(key)).join(''));
  assert.doesNotMatch(publicCache, /receipt_path|last_body|auth_secret|access_token/);
  assert.deepEqual(errors, []);
  records.push({ app: 'player-mobile', checks: ['initial queries bounded', 'history server pagination', '50 latest messages', 'older messages', 'deposit navigation'], requests: calls.length });
  await context.close();

  const admin = await openApp(true);
  const ap = admin.page;
  const nav = ap.getByRole('navigation', { name: 'Navegación principal', exact: true });
  if (process.env.PANEL_VISUAL_CHECK || process.argv.includes('--visual')) {
    await ap.waitForSelector('.admin-overview');
    await ap.screenshot({ path: '/tmp/gana777-browser-checks/panel-overview.png', fullPage: true });
    for (const [label, shot] of [['Cargas', 'deposits'], ['Retiros', 'withdrawals'], ['Usuarios', 'players'], ['Bonos', 'bonuses'], ['Temas', 'themes'], ['Contactos', 'contacts'], ['Cuentas', 'accounts'], ['Mensajes', 'announcements'], ['Turnos', 'shifts'], ['Platform', 'platform'], ['Telegram', 'telegram'], ['Cajeros', 'cashiers']]) {
      await nav.getByRole('button', { name: new RegExp(`^${label}(?: [0-9]|$)`) }).click();
      await ap.waitForTimeout(200);
      await ap.screenshot({ path: `/tmp/gana777-browser-checks/panel-${shot}.png`, fullPage: false });
      if (shot === 'deposits' || shot === 'withdrawals') {
        const first = ap.locator(shot === 'deposits' ? '.load-request-button' : '.withdrawal-summary-button').first();
        if (await first.count()) {
          await first.click();
          await ap.waitForSelector('.load-modal-backdrop');
          await ap.screenshot({ path: `/tmp/gana777-browser-checks/panel-${shot}-detail.png`, fullPage: false });
          await ap.keyboard.press('Escape');
        }
      }

      assert.ok(await ap.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow`);
    }
    assert.equal(await ap.locator('.admin-page-guide, .admin-guide-dialog').count(), 0);
    for (const theme of ['grafito', 'esmeralda', 'dorado', 'negro', 'violeta']) {
      await ap.getByRole('combobox', { name: 'Tema del panel', exact: true }).selectOption(theme);
      await ap.waitForFunction(value => document.querySelector('.admin-shell')?.classList.contains(`admin-theme-${value}`), theme);
      assert.ok(await ap.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }

  }
  await nav.getByRole('button', { name: 'Usuarios', exact: true }).click();
  await ap.waitForSelector('.player-card');
  assert.equal(await ap.locator('.player-card').count(), 20);
  if (process.env.PANEL_VISUAL_CHECK || process.argv.includes('--visual')) await ap.screenshot({ path: '/tmp/gana777-browser-checks/panel-players-loaded.png', fullPage: false });
  await ap.getByRole('searchbox', { name: 'Buscar jugadores por nombre de usuario, ID o teléfono' }).fill('jugador124');
  await ap.waitForFunction(() => document.querySelectorAll('.player-card').length === 1 && document.querySelector('.player-card').textContent.includes('jugador124'));
  await nav.getByRole('button', { name: /^Retiros/ }).click();
  await ap.waitForSelector('.withdrawal-summary-button');
  assert.ok(await ap.locator('.withdrawal-summary-button').count() <= 20);
  const parts = admin.calls.filter(call => call.path.endsWith('/withdrawal_parts'));
  assert.ok(parts.length > 0 && parts.every(call => call.query.request_id?.startsWith('in.(')));
  await nav.getByRole('button', { name: /^Chat \d/ }).click();
  await ap.waitForSelector('.regular-chat-admin-view .admin-chat-item');
  assert.ok(await ap.locator('.regular-chat-admin-view .admin-chat-item').count() <= 50);
  await ap.locator('.regular-chat-admin-view .admin-chat-item').first().click();
  await ap.waitForSelector('.admin-chat-thread .message');
  await ap.getByRole('button', { name: 'Ver mensajes anteriores', exact: true }).click();
  await ap.waitForFunction(() => document.querySelectorAll('.admin-chat-thread .message').length === 100);
  await ap.screenshot({ path: '/tmp/gana777-browser-checks/admin-chat.png', fullPage: true });
  await nav.getByRole('button', { name: /^Chat externo/ }).click();
  await ap.waitForSelector('.external-chat-admin-view .admin-chat-item');
  await ap.locator('.external-chat-admin-view .admin-chat-item').first().click();
  await ap.waitForSelector('.external-chat-admin-view .message');
  await ap.getByRole('button', { name: 'Ver mensajes anteriores', exact: true }).click();
  await ap.waitForFunction(() => document.querySelectorAll('.external-chat-admin-view .message').length === 100);
  await ap.getByRole('button', { name: 'Salir', exact: true }).click();
  await ap.waitForSelector('.admin-login');
  assert.equal(await ap.locator('.admin-chat-item, .player-card').count(), 0);
  assert.deepEqual(admin.errors, []);
  records.push({ app: 'admin-desktop', checks: ['20 players per page', 'server search finds old player', '10 withdrawals per queue', 'parts restricted to visible ids', '50 conversations per page', 'older chat messages', 'external chat pagination', 'logout clears private screens'], requests: admin.calls.length });
  await admin.context.close();
  if (process.env.PANEL_VISUAL_CHECK || process.argv.includes('--visual')) {
    const mobile = await openApp(true, true);
    await mobile.page.waitForSelector('.admin-overview');
    await mobile.page.screenshot({ path: '/tmp/gana777-browser-checks/panel-mobile.png', fullPage: true });
    assert.ok(await mobile.page.locator('.admin-sidebar').evaluate(element => element.inert));
    await mobile.page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
    await mobile.page.getByRole('searchbox', { name: 'Buscar sección del panel' }).fill('Usuarios');
    await mobile.page.screenshot({ path: '/tmp/gana777-browser-checks/panel-mobile-menu.png', fullPage: true });
    await mobile.page.getByRole('navigation', { name: 'Navegación principal', exact: true }).getByRole('button', { name: 'Usuarios', exact: true }).click();
    await mobile.page.waitForSelector('.player-card');
    assert.ok(await mobile.page.locator('.admin-sidebar').evaluate(element => element.inert));
    assert.ok(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await mobile.page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
    await mobile.page.keyboard.press('Escape');
    assert.ok(await mobile.page.locator('.admin-sidebar').evaluate(element => element.inert));
    assert.deepEqual(mobile.errors, []);
    records.push({ app: 'admin-mobile', checks: ['responsive layout', 'menu search', 'inert closed drawer', 'Escape closes menu', 'no horizontal overflow'] });
    await mobile.context.close();
    const tablet = await openApp(true);
    await tablet.page.setViewportSize({ width: 914, height: 900 });
    await tablet.page.waitForSelector('.admin-overview');
    await tablet.page.screenshot({ path: '/tmp/gana777-browser-checks/panel-tablet.png', fullPage: true });
    assert.ok(await tablet.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await tablet.page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
    await tablet.page.getByRole('searchbox', { name: 'Buscar sección del panel', exact: true }).focus();
    await tablet.page.screenshot({ path: '/tmp/gana777-browser-checks/panel-tablet-menu.png', fullPage: false });
    await tablet.page.keyboard.press('Escape');
    assert.deepEqual(tablet.errors, []);
    records.push({ app: 'admin-tablet', checks: ['914 px dashboard', 'readable card headings', 'single search focus ring', 'menu keyboard navigation'] });
    await tablet.context.close();
  }
  const queue = { version: 9200, events: [], rows: Array.from({ length: 75 }, (_, i) => ({ ...requestRows[0], id: uid(20000 + i), user_name: `Carga compartida ${i}`, status: i === 2 ? 'approved' : 'pending', receipt_path: i === 0 ? 'mock/receipt.jpg' : null, created_at: stamp(i), claimed_by: i === 1 ? uid(9001) : null, claimed_name: i === 1 ? 'Bea' : null, claim_token: i === 1 ? uid(9199) : null })) };
  const shared = await openApp(true, false, queue);
  const qp = shared.page;
  const qnav = qp.getByRole('navigation', { name: 'Navegación principal', exact: true });
  assert.equal(shared.calls.filter(call => call.path.endsWith('/list_deposit_queue')).length, 0, 'Inicio no descarga la bandeja');
  await qnav.getByRole('button', { name: /^Cargas/ }).click();
  await qp.waitForFunction(() => document.querySelectorAll('.load-request-button').length === 30);
  assert.equal(await qp.locator('.sac-board').count(), 0);
  await qp.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await qp.waitForFunction(() => document.querySelector('.loads-pager')?.textContent.includes('Página 2'));
  await qp.getByRole('button', { name: 'Anterior', exact: true }).click();
  await qp.waitForFunction(() => document.querySelector('.loads-pager')?.textContent.includes('Página 1'));
  await qp.locator('.load-request-button').first().click();
  await qp.waitForSelector('.deposit-claim-status');
  assert.ok((await qp.locator('.deposit-claim-status').innerText()).includes('Tomada por vos'));
  await qp.waitForSelector('.receipt-preview-error');
  const availableAfterTake = queue.rows.filter(row => row.status === 'pending' && !row.claimed_by).length;
  await qp.waitForFunction(total => document.querySelector('.loads-count')?.textContent.startsWith(String(total)), availableAfterTake);
  assert.equal(shared.calls.filter(call => call.path.includes('/storage/')).length, 1, 'Actualizar la bandeja no vuelve a pedir el mismo comprobante');
  await qp.getByRole('button', { name: 'Ver responsables y movimientos', exact: true }).click();
  await qp.waitForSelector('.deposit-claim-history [aria-live]');
  await qp.getByRole('button', { name: 'Liberar carga', exact: true }).click();
  await qp.waitForSelector('.load-modal', { state: 'detached' });
  queue.failNextTake = true;
  await qp.locator('.load-request-button').first().click();
  await qp.getByRole('alert').filter({ hasText: 'ya fue tomada' }).waitFor();
  assert.equal(await qp.locator('.load-modal').count(), 0, 'Un conflicto no abre una carga como propia');
  await qp.locator('.load-request-button').first().click();
  await qp.waitForSelector('.load-modal');
  await qp.keyboard.press('Escape');
  await qp.getByRole('tab', { name: 'Mis cargas', exact: true }).click();
  await qp.waitForFunction(() => document.querySelectorAll('.load-request-button').length === 1);
  await qp.locator('.load-request-button').first().click();
  await qp.getByRole('button', { name: 'Aceptar carga', exact: true }).click();
  await qp.waitForSelector('.credit-ready-modal');
  await qp.getByRole('button', { name: 'Ya acredité la carga', exact: true }).click();
  await qp.waitForSelector('.credit-ready-modal', { state: 'detached' });
  await qp.getByRole('tab', { name: 'Todas', exact: true }).click();
  await qp.getByRole('button', { name: /Carga compartida 1 / }).click();
  await qp.waitForSelector('.deposit-claim-status');
  assert.ok((await qp.locator('.deposit-claim-status').innerText()).includes('Bea'));
  assert.equal(await qp.getByRole('button', { name: 'Aceptar carga', exact: true }).count(), 0);
  await qp.getByRole('button', { name: 'Revisar y asumir carga', exact: true }).click();
  await qp.getByLabel('Motivo de la reasignación').fill('Consultado con Bea: todavía no acreditó');
  qp.once('dialog', dialog => dialog.accept());
  await qp.getByRole('button', { name: 'Confirmar y asumir a mi nombre', exact: true }).click();
  await qp.getByRole('button', { name: 'Aceptar carga', exact: true }).waitFor();
  await qp.screenshot({ path: '/tmp/gana777-browser-checks/deposit-shared-detail.png', fullPage: false });
  await qp.keyboard.press('Escape');
  await qp.setViewportSize({ width: 390, height: 844 });
  await qp.screenshot({ path: '/tmp/gana777-browser-checks/deposit-shared-mobile.png', fullPage: true });
  assert.ok(await qp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await qp.getByRole('button', { name: /Carga compartida 1 / }).click();
  assert.ok(await qp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await qp.screenshot({ path: '/tmp/gana777-browser-checks/deposit-shared-detail-mobile.png', fullPage: false });
  await qp.keyboard.press('Escape');
  await qp.setViewportSize({ width: 1440, height: 1000 });
  await qp.getByRole('button', { name: /Carga compartida 1 / }).click();
  let finishReview;
  queue.reviewBarrier = new Promise(resolve => { finishReview = resolve; });
  const reviewSent = qp.waitForRequest(request => request.url().endsWith('/rpc/review_queue_deposit'));
  const reviewReceived = qp.waitForResponse(response => response.url().endsWith('/rpc/review_queue_deposit'));
  await qp.getByRole('button', { name: 'Aceptar carga', exact: true }).click();
  await reviewSent;
  await qnav.getByRole('button', { name: 'Inicio', exact: true }).click();
  await qp.waitForSelector('.admin-overview');
  delete queue.reviewBarrier; finishReview();
  await reviewReceived;
  await qp.waitForFunction(() => !document.querySelector('.admin-refresh')?.disabled);
  await qnav.getByRole('button', { name: /^Cargas/ }).click();
  await qp.getByRole('button', { name: /Carga compartida 1 / }).waitFor();
  assert.equal(await qp.locator('.credit-ready-modal').count(), 0, 'Una aprobación tardía no reabre una ventana después de navegar');
  assert.deepEqual(shared.errors, []);
  records.push({ app: 'shared-deposit-queue', checks: ['30 rows per page', 'no SAC selector', 'server-confirmed take', 'explicit release', 'take conflict', 'mine filter', 'credit confirmation', 'foreign claim read-only', 'supervisor reassignment', 'audit on demand', 'mobile without overflow', 'late approval does not reopen a dismissed screen'] });
  await shared.context.close();
  const bonusPlan = { offers: [] };
  const bonusAdmin = await openApp(true, false, null, bonusPlan);
  const bp = bonusAdmin.page;
  await bp.getByRole('navigation', { name: 'Navegación principal', exact: true }).getByRole('button', { name: 'Bonos', exact: true }).click();
  await bp.getByRole('button', { name: 'Crear bono', exact: true }).waitFor({ state: 'visible' });
  await bp.locator('input[name="title"]').fill('Tarde 50%');
  await bp.locator('input[name="value"]').fill('50');
  await bp.locator('input[name="min_amount"]').fill('1.000');
  await bp.locator('input[name="max_amount"]').fill('50.000');
  await bp.getByRole('checkbox', { name: 'Disponible solo en un horario', exact: true }).check();
  await bp.getByLabel('Desde (hora de Paraguay)', { exact: true }).fill('14:00');
  await bp.getByLabel('Hasta (hora de Paraguay)', { exact: true }).fill('17:00');
  await bp.getByRole('button', { name: 'Crear bono', exact: true }).click();
  await bp.waitForSelector('.bonus-offer');
  assert.equal(bonusPlan.saved.bonus_percent, 50);
  assert.equal(bonusPlan.saved.max_amount, 50000);
  assert.equal(bonusPlan.saved.bonus_start_time, '14:00');
  assert.equal(bonusPlan.saved.bonus_end_time, '17:00');
  assert.equal(bonusPlan.saved.cooldown_hours, 0);
  assert.deepEqual(bonusPlan.saved.bonus_days, [1,2,3,4,5,6,7]);
  await bp.getByRole('button', { name: 'Editar', exact: true }).click();
  assert.equal(await bp.getByLabel('Desde (hora de Paraguay)', { exact: true }).inputValue(), '14:00');
  await bp.screenshot({ path: '/tmp/gana777-browser-checks/bonus-schedule-admin.png', fullPage: false });
  await bp.setViewportSize({ width: 390, height: 844 });
  assert.ok(await bp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(bonusAdmin.errors, []);
  await bonusAdmin.context.close();
  bonusPlan.now = '2026-11-07T16:59:50-03:00';
  const bonusPlayer = await openApp(false, true, null, bonusPlan);
  const pp = bonusPlayer.page;
  await pp.getByRole('button', { name: /Bonos disponibles/ }).click();
  await pp.getByRole('button', { name: 'Obtener', exact: true }).click();
  await pp.waitForSelector('.modern-deposit-flow');
  await pp.getByLabel('¿Cuánto querés cargar?', { exact: true }).fill('50.000');
  assert.equal(await pp.getByRole('button', { name: 'Continuar', exact: true }).isEnabled(), true);
  const promotionCalls = bonusPlayer.calls.filter(call => call.path.endsWith('/promotions')).length;
  await pp.clock.fastForward(11_000);
  await pp.locator('.deposit-bonus-note').filter({ hasText: 'Fuera de horario' }).waitFor();
  assert.equal(await pp.getByRole('button', { name: 'Continuar', exact: true }).isEnabled(), false);
  assert.equal(bonusPlayer.calls.filter(call => call.path.endsWith('/promotions')).length, promotionCalls, 'Cerrar el horario no consulta promociones');
  await pp.screenshot({ path: '/tmp/gana777-browser-checks/bonus-schedule-expired.png', fullPage: false });
  await pp.getByRole('button', { name: 'Continuar sin bono', exact: true }).click();
  assert.equal(await pp.getByRole('button', { name: 'Continuar', exact: true }).isEnabled(), true);
  assert.deepEqual(bonusPlayer.errors, []);
  await bonusPlayer.context.close();
  records.push({ app: 'scheduled-bonuses', checks: ['50% and 50,000 deposit maximum', 'save/edit daily schedule', 'seven days selected', 'mobile form', 'live expiry blocks selected bonus', 'explicit continue without bonus', 'no query at schedule boundary'] });
  writeFileSync('/tmp/gana777-browser-checks/results.json', JSON.stringify(records, null, 2));
  console.log(JSON.stringify(records, null, 2));
} catch (error) {
  const last = browser.contexts().at(-1)?.pages().at(-1);
  if (last) { console.error((await last.locator('body').innerText()).slice(0, 5000)); await last.screenshot({ path: '/tmp/gana777-browser-checks/failure.png', fullPage: true }).catch(() => {}); }
  if (last) console.error(JSON.stringify(await last.evaluate(() => [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 && r.left < innerWidth && r.width > 0; }).slice(0, 16).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width }))), null, 2));
  throw error;
} finally { await browser.close(); }
