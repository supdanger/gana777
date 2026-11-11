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
async function openApp(admin, mobile = false, queue = null, bonusPlan = null, chatPlan = null, loginPlan = null) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  if (!loginPlan) await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: session(admin, bonusPlan?.now ? Date.parse(bonusPlan.now) : Date.now()) });
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
    if (url.pathname.includes('/auth/v1/') && resource === 'token' && loginPlan) {
      loginPlan.attempts++;
      if (loginPlan.rejectNext) { loginPlan.rejectNext = false; return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }) }); }
      body = session(admin);
    }
    else if (url.pathname.includes('/auth/v1/')) body = resource === 'user' ? account(admin) : session(admin);
    else if (url.pathname.includes('/functions/') && resource === 'submit-deposit' && bonusPlan?.receipt) {
      const receipt = bonusPlan.receipt;
      receipt.submissions++;
      const uploaded = await new Request(req.url(), { method: 'POST', headers: req.headers(), body: req.postDataBuffer() }).formData();
      receipt.fields = { amount: uploaded.get('amount'), bonus: uploaded.get('bonus_id'), assignment: uploaded.get('bank_assignment_id'), fileSize: uploaded.get('receipt')?.size };
      if (receipt.barrier) await receipt.barrier;
      if (receipt.failNext) { receipt.failNext = false; return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'No pudimos enviar el comprobante. Probá de nuevo.' }) }); }
      receipt.saved = { ...requestRows[0], id: uid(25000), amount: Number(uploaded.get('amount')), status: 'pending', created_at: new Date().toISOString(), receipt_path: 'mock/uploaded.jpg' };
      body = { request: receipt.saved };
    }
    else if (url.pathname.includes('/functions/') && resource === 'player-entry') {
      if (bonusPlan?.entryExpired) return route.fulfill({ status: 410, contentType: 'application/json', body: JSON.stringify({ error: 'expired' }) });
      if (bonusPlan?.entryFailNext) { bonusPlan.entryFailNext = false; return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); }
      body = session(false);
    }
    else if (url.pathname.includes('/functions/') && resource === 'player-access' && chatPlan) {
      const args = req.postDataJSON();
      if (args.action === 'admin-list') body = { ok: true, requests: Array.from({ length: 4 }, (_, i) => ({ id: uid(30000 + i), username: `solicitante${i}`, referral_code: i ? null : 'equipo', status: ['pending', 'approved', 'approved', 'rejected'][i], player_user_id: i === 1 || i === 2 ? uid(31000 + i) : null, has_personal_url: i === 2, created_at: stamp(i), updated_at: stamp(i), latest_message: { sender: 'player', body: `Consulta de acceso ${i}`, created_at: stamp(i) } })) };
      else if (args.action === 'admin-messages') body = { ok: true, messages: [{ id: 1, sender: 'player', body: `Mensaje de la solicitud ${args.request_id}`, created_at: stamp(0) }], casino_url: '' };
      else if (args.action === 'admin-count') body = { ok: true, pending_count: 2 };
      else return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Esta prueba no permite modificar accesos.' }) });
    }
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
          let rows = queue.rows.filter(row => !row.archived);
          if (args.p_filter === 'available') rows = rows.filter(row => row.status === 'pending' && !row.credited_at && !row.claimed_by);
          else if (args.p_filter === 'mine') rows = rows.filter(row => row.status === 'pending' && !row.credited_at && row.claimed_by === actor);
          else rows = rows.filter(row => row.status === 'pending' || row.status === 'approved' || row.status === 'rejected' || row.credited_at);
          rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
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
          if (resource === 'review_queue_deposit') { if (queue.reviewBarrier) await queue.reviewBarrier; row.status = args.p_status; row.credit_started_at = stamp(0); if (args.p_status === 'approved') row.credited_at = stamp(0); body = row; }
          if (resource === 'confirm_queue_deposit_credit') { row.credited_at = stamp(0); body = { notification_id: uid(9900), newly_credited: false }; }
          queue.events.push({ request_id: row.id, event: resource === 'reassign_deposit' ? 'reassigned' : resource === 'review_queue_deposit' ? args.p_status : 'taken', actor_name: 'Operador prueba', created_at: stamp(0), reason: args.p_reason });
        }
      }
      else if (resource === 'get_deposit_queue_mode') return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Function not available in legacy fixture' }) });
      else if (resource === 'create_withdrawal' && bonusPlan?.withdrawalTest) {
        const args = req.postDataJSON(); bonusPlan.submissions = (bonusPlan.submissions || 0) + 1; bonusPlan.savedWithdrawal = args;
        body = { ...requestRows[0], id: uid(32000), user_id: uid(1), kind: 'withdrawal', amount: Number(args.p_amount), status: 'pending', holder: args.p_holder, cbu: args.p_cbu, alias: args.p_alias, created_at: new Date().toISOString(), approved_at: null }; single = true;
      }
      else if (resource === 'is_admin') body = admin;
      else if (resource === 'get_admin_context') { body = { is_super_admin: true, username: 'admin', display_name: 'Operador prueba', avatar_path: null, permissions: {} }; single = true; }
      else if (resource === 'get_my_session_revoked_at') body = null;
      else if (resource === 'get_my_whatsapp_url') body = 'https://wa.me/595981111111';
      else if (resource === 'player_next_deposit_number') body = 4;
      else if (resource === 'special_bonus_availability' && bonusPlan?.availability) { const serverNow = new Date(await page.evaluate(() => Date.now()) + (bonusPlan.clockOffset || 0)).toISOString(); body = bonusPlan.availability.map(row => ({ ...row, server_now: serverNow })); }
      else if (resource === 'get_bank_operation_status') { body = { mode: 'online', resumes_at: null, active_shift_key: 'morning' }; single = true; }
      else if (resource === 'get_bonus_counter_dashboard') body = { active: { id: 1, started_at: stamp(0), summary: { counters: [{ key: 'fixed-1000', title: 'Bono + $1.000', loads: 41, bonusTotal: 41000 }, { key: 'fixed-2500', title: 'Bono + $2.500', loads: 17, bonusTotal: 42500 }, { key: 'none', title: 'Sin bono', loads: 11, bonusTotal: 0 }, { key: 'percent-100', title: 'Bono 100%', loads: 6, bonusTotal: 30000 }], totalLoads: 75, withoutBonus: 11, totalBonusGranted: 113500, freeSpinsGranted: 0 } }, history: [] };
      else if (resource === 'assign_bank_account') { body = { assignment_id: uid(999), id: uid(998), bank: 'Banco prueba', holder: 'Prueba Banco', cbu: '0123456789012345678901', alias: 'prueba.banco' }; single = true; }
    } else {
      if (resource === 'messages' && req.method() === 'POST' && chatPlan) {
        const payload = req.postDataJSON();
        chatPlan.sends.push(payload);
        if (chatPlan.barrier) await chatPlan.barrier;
        if (chatPlan.failNextSend) { chatPlan.failNextSend = false; return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'No pudimos enviar la respuesta.' }) }); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...payload, id: uid(29000 + chatPlan.sends.length), created_at: new Date().toISOString() }) });
      }
      if (resource === 'promotions') {
        if ((!bonusPlan || bonusPlan.scheduleSupported === false) && url.searchParams.get('select')?.includes('bonus_start_time')) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '42703', message: 'column promotions.bonus_start_time does not exist' }) });
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
      else if (resource === 'request_summaries' && bonusPlan?.withdrawalTest) body = [];
      else if (resource === 'request_summaries' && chatPlan && url.searchParams.has('user_id')) body = [...chatPlan.rows];
      else if (resource === 'request_summaries') body = bonusPlan && !admin ? [...requestRows.filter(row => row.kind !== 'deposit' || row.status !== 'pending'), ...(bonusPlan.receipt?.saved ? [bonusPlan.receipt.saved] : [])] : [...requestRows];
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
  if (admin) await context.addInitScript(() => localStorage.setItem('gana777:panel-theme', 'esmeralda'));
  const page = await context.newPage();
  if (bonusPlan?.now) await page.clock.install({ time: new Date(bonusPlan.now) });
  page.on('pageerror', error => errors.push(error.message));
  const appUrl = admin ? (process.env.ADMIN_PREVIEW_URL || 'http://127.0.0.1:5181') : (process.env.USER_PREVIEW_URL || 'http://127.0.0.1:5180');
  await page.goto(appUrl + (bonusPlan?.entryToken ? `/#e=${bonusPlan.entryToken}` : ''));
  try { await page.waitForSelector(loginPlan ? '.user-login' : bonusPlan?.entryExpired || bonusPlan?.entryRetry ? '.entry-access-screen' : admin ? '.admin-shell' : '.user-app', { timeout: 20000 }); }
  catch (error) { console.error(JSON.stringify({ text: await page.locator('body').innerText(), errors, calls }, null, 2)); await page.screenshot({ path: '/tmp/gana777-browser-checks/failure.png', fullPage: true }); throw error; }
  return { context, page, calls, errors };
}
try {
  const loginPlan = { attempts: 0, rejectNext: true };
  const loginApp = await openApp(false, true, null, null, null, loginPlan);
  const loginPage = loginApp.page;
  await loginPage.getByRole('heading', { name: 'Bienvenido', exact: true }).waitFor();
  await loginPage.waitForFunction(() => document.querySelector('.login-character img')?.naturalWidth > 0);
  const originalMascot = await loginPage.locator('.login-character img').getAttribute('src');
  assert.match(originalMascot, /panda-login-transparent/);
  assert.equal(await loginPage.getByRole('textbox', { name: 'Usuario', exact: true }).count(), 1);
  for (const [width, height] of [[477, 849], [390, 844], [320, 700], [1440, 1000]]) {
    await loginPage.setViewportSize({ width, height }); await loginPage.waitForTimeout(100);
    assert.ok(await loginPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Login sin desborde a ${width}px`);
    assert.equal(await loginPage.locator('.login-character img').getAttribute('src'), originalMascot);
    await loginPage.screenshot({ path: `/tmp/gana777-browser-checks/login-refined-${width}.png`, fullPage: true });
  }
  await loginPage.setViewportSize({ width: 390, height: 844 });
  await loginPage.getByRole('textbox', { name: 'Usuario', exact: true }).fill('jugador');
  await loginPage.locator('#password').fill('PruebaSegura123!');
  await loginPage.getByRole('button', { name: 'Mostrar contraseña', exact: true }).click();
  assert.equal(await loginPage.locator('#password').getAttribute('type'), 'text');
  await loginPage.getByRole('button', { name: 'Ocultar contraseña', exact: true }).click();
  assert.equal(await loginPage.locator('#password').getAttribute('type'), 'password');
  await loginPage.getByRole('button', { name: 'Crear usuario', exact: false }).click();
  await loginPage.locator('.player-access-card').waitFor();
  await loginPage.locator('.player-access-back').click();
  await loginPage.locator('.login-card').waitFor();
  await loginPage.getByRole('textbox', { name: 'Usuario', exact: true }).fill('jugador');
  await loginPage.locator('#password').fill('PruebaSegura123!');
  await loginPage.getByRole('button', { name: 'Instalar GANA777', exact: true }).click();
  await loginPage.getByRole('dialog').waitFor();
  await loginPage.getByRole('button', { name: 'Cerrar instrucciones', exact: true }).click();
  await loginPage.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await loginPage.locator('.login-card .alert.error').waitFor();
  assert.equal(await loginPage.locator('#email').inputValue(), 'jugador');
  assert.equal(await loginPage.locator('#password').inputValue(), 'PruebaSegura123!');
  assert.equal(loginPlan.attempts, 1);
  await loginPage.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await loginPage.waitForSelector('.user-app');
  assert.equal(loginPlan.attempts, 2);
  assert.deepEqual(loginApp.errors, []);
  records.push({ app: 'refined-login', checks: ['original panda unchanged', '320 to 1440 px', 'visible username label', 'password visibility', 'access request and return', 'installation instructions', 'failed login preserves fields', 'successful login'] });
  await loginApp.context.close();

  for (const mode of ['success', 'retry', 'expired']) {
    const entryPlan = { offers: [], entryToken: 'a'.repeat(32), entryExpired: mode === 'expired', entryFailNext: mode === 'retry', entryRetry: mode === 'retry' };
    const entry = await openApp(false, true, null, entryPlan);
    assert.equal(new URL(entry.page.url()).hash, '', 'el secreto desaparece de la dirección');
    if (mode === 'retry') {
      await entry.page.getByRole('button', { name: 'Reintentar ingreso', exact: true }).click();
      await entry.page.waitForSelector('.user-app');
      assert.equal(entry.calls.filter(call => call.path.endsWith('/player-entry')).length, 2);
    } else if (mode === 'expired') {
      await entry.page.getByRole('heading', { name: 'Pedí un enlace nuevo', exact: true }).waitFor();
      assert.equal(await entry.page.locator('.user-app, .login-card').count(), 0, 'nunca muestra login ni otra cuenta');
    } else {
      assert.equal(entry.calls.filter(call => call.path.endsWith('/player-entry')).length, 1, 'StrictMode no duplica el ingreso');
    }
    assert.deepEqual(entry.errors, []);
    await entry.context.close();
  }
  records.push({ app: 'direct-player-entry', checks: ['automatic session', 'secret removed from URL', 'retry without login', 'expired link without login', 'single request in StrictMode'] });
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

  const withdrawalPlan = { withdrawalTest: true, offers: [], submissions: 0 };
  const withdrawalApp = await openApp(false, true, null, withdrawalPlan);
  const wp = withdrawalApp.page;
  await wp.getByRole('button', { name: /^Retir/ }).click();
  await wp.getByText('Retiro mínimo: $5.000.', { exact: true }).waitFor();
  await wp.getByRole('textbox', { name: 'Titular de la cuenta', exact: true }).fill('Persona Prueba');
  await wp.getByRole('textbox', { name: 'CBU / CVU', exact: true }).fill('0123456789012345678901');
  const withdrawalInput = wp.getByRole('textbox', { name: 'Monto a retirar en pesos argentinos', exact: true });
  const withdrawalButton = wp.getByRole('button', { name: 'Solicitar retiro', exact: true });
  for (const value of ['1', '1000', '4.999', '4.999,99']) {
    await withdrawalInput.fill(value);
    await wp.getByText('El retiro mínimo es de $5.000. Ingresá $5.000 o más.', { exact: true }).waitFor();
    assert.equal(await withdrawalButton.isDisabled(), true);
    await withdrawalInput.evaluate(element => element.form.requestSubmit());
    assert.equal(withdrawalPlan.submissions, 0, 'El envío forzado tampoco llama a la RPC por debajo de 5000');
  }
  await withdrawalInput.fill('5.000');
  assert.equal(await withdrawalButton.isEnabled(), true);
  await withdrawalButton.click();
  await wp.getByText('Tu solicitud fue enviada. Podés seguir su estado en el historial.', { exact: true }).waitFor();
  assert.equal(withdrawalPlan.submissions, 1);
  assert.equal(withdrawalPlan.savedWithdrawal.p_amount, '5000');
  assert.deepEqual(withdrawalApp.errors, []);
  records.push({ app: 'minimum-withdrawal', checks: ['explicit 5000 minimum', '4999.99 blocked', 'forced submit blocked', '5000 accepted', 'canonical amount sent once'] });
  await withdrawalApp.context.close();

  const chatPlan = { failNextSend: true, sends: [], rows: Array.from({ length: 16 }, (_, i) => ({ ...requestRows[i], id: uid(28000 + i), user_id: uid(301), kind: i < 8 ? 'deposit' : 'withdrawal', status: i % 2 ? 'approved' : 'pending', credited_at: i % 2 ? stamp(i + 80) : null, approved_at: i % 2 ? stamp(i + 60) : null })) };
  const admin = await openApp(true, false, null, null, chatPlan);
  const ap = admin.page;
  const nav = ap.getByRole('navigation', { name: 'Navegación principal', exact: true });
  assert.equal(await ap.getByRole('combobox', { name: 'Tema del panel', exact: true }).count(), 0);
  assert.equal(await ap.locator('.admin-shell').evaluate(element => getComputedStyle(element).getPropertyValue('--panel-surface').trim()), '#1b1b1b', 'Una preferencia antigua no cambia el tema único');
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
    assert.equal(await ap.getByRole('combobox', { name: 'Tema del panel', exact: true }).count(), 0);
    assert.equal(await ap.locator('.admin-shell').evaluate(element => getComputedStyle(element).getPropertyValue('--panel-surface').trim()), '#1b1b1b');

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
  await nav.getByRole('button', { name: /^Centro de atención/ }).click();
  await ap.waitForSelector('.regular-chat-admin-view .admin-chat-item');
  assert.ok(await ap.locator('.regular-chat-admin-view .admin-chat-item').count() <= 50);
  const chatRows = ap.locator('.regular-chat-admin-view .admin-chat-item');
  assert.equal(await ap.locator('.regular-chat-admin-view .admin-chat-inbox').isVisible(), true);
  assert.equal(await ap.locator('.regular-chat-admin-view .admin-chat-thread').isVisible(), false);
  await ap.getByRole('button', { name: /^Por responder/ }).click();
  await ap.waitForFunction(() => document.querySelectorAll('.regular-chat-admin-view .attention-thread-status').length > 0 && [...document.querySelectorAll('.regular-chat-admin-view .attention-thread-status')].every(item => item.classList.contains('is-pending')));
  const pendingTimes = await chatRows.locator('time').evaluateAll(items => items.map(item => item.dateTime));
  assert.deepEqual(pendingTimes, [...pendingTimes].sort(), 'Pendientes más antiguos primero');
  await ap.getByRole('button', { name: 'Esperando al jugador', exact: true }).click();
  await ap.waitForFunction(() => [...document.querySelectorAll('.regular-chat-admin-view .attention-thread-status')].every(item => item.textContent === 'Esperando al jugador'));
  await ap.getByRole('button', { name: /^Por responder/ }).click();
  await ap.waitForFunction(() => [...document.querySelectorAll('.regular-chat-admin-view .attention-thread-status')].some(item => item.textContent === 'Por responder'));
  await ap.locator('.regular-chat-admin-view .admin-chat-item').first().click();
  await ap.waitForSelector('.admin-chat-thread .message');
  await ap.getByRole('button', { name: 'Ver mensajes anteriores', exact: true }).click();
  await ap.waitForFunction(() => document.querySelectorAll('.admin-chat-thread .message').length === 100);
  assert.equal(await ap.locator('.regular-chat-admin-view .admin-chat-inbox').isVisible(), false);
  assert.equal(await ap.locator('.attention-player-context').count(), 0, 'La ficha se consulta a pedido');
  await ap.getByRole('button', { name: 'Ver datos del jugador', exact: true }).click();
  await ap.locator('.attention-pending-counts').getByText('4', { exact: true }).first().waitFor();
  const scopedOperations = () => admin.calls.filter(call => call.path.endsWith('/request_summaries') && call.query.user_id);
  assert.ok(scopedOperations().every(call => call.query.status === 'eq.pending'), 'Historial cerrado no consulta movimientos recientes');
  await ap.locator('.attention-player-context details summary').first().click();
  await ap.getByText('Referencia', { exact: true }).first().waitFor();
  await ap.getByRole('button', { name: 'Ver historial', exact: true }).click();
  await ap.getByText('8 cargas · Más recientes primero.', { exact: true }).waitFor();
  assert.equal(await ap.locator('.attention-recent-operations article').count(), 5);
  await ap.locator('.attention-history-pager').getByRole('button', { name: 'Siguiente', exact: true }).click();
  await ap.waitForFunction(() => document.querySelectorAll('.attention-recent-operations article').length === 3);
  await ap.getByRole('group', { name: 'Tipo de operación del historial' }).getByRole('button', { name: 'Retiros', exact: true }).click();
  await ap.getByText('8 retiros · Más recientes primero.', { exact: true }).waitFor();
  assert.ok(scopedOperations().every(call => call.query.user_id === `eq.${uid(301)}`));
  assert.ok(scopedOperations().filter(call => !call.query.status).every(call => call.query.limit === '5' && ['eq.deposit', 'eq.withdrawal'].includes(call.query.kind)));
  await ap.getByRole('button', { name: 'Cerrar historial', exact: true }).click();
  await ap.getByRole('button', { name: 'Cerrar datos del jugador', exact: true }).click();
  const composer = ap.locator('#admin-chat-message');
  await ap.getByRole('combobox', { name: 'Respuestas rápidas', exact: true }).selectOption('greeting');
  assert.equal(await composer.inputValue(), 'Hola, ¿en qué podemos ayudarte?');
  assert.equal(chatPlan.sends.length, 0, 'Insertar plantilla no envía mensajes');
  await composer.fill('Mi respuesta editada.');
  await ap.getByRole('combobox', { name: 'Respuestas rápidas', exact: true }).selectOption('checking');
  const firstDraft = await composer.inputValue();
  assert.ok(firstDraft.startsWith('Mi respuesta editada.\n'));
  await ap.getByRole('button', { name: 'Volver a conversaciones', exact: true }).click();
  await chatRows.nth(1).click();
  assert.equal(await composer.inputValue(), '');
  await composer.fill('Borrador del segundo jugador');
  await ap.getByRole('button', { name: 'Volver a conversaciones', exact: true }).click();
  await chatRows.first().click();
  assert.equal(await composer.inputValue(), firstDraft, 'Cada jugador conserva su borrador');
  await ap.getByRole('button', { name: 'Enviar respuesta', exact: true }).click();
  await ap.locator('.admin-chat-feedback.is-error').waitFor();
  assert.equal(await composer.inputValue(), firstDraft, 'El fallo conserva el texto');
  let releaseSend;
  chatPlan.barrier = new Promise(resolve => { releaseSend = resolve; });
  await composer.evaluate(element => { element.form.requestSubmit(); element.form.requestSubmit(); });
  await ap.waitForFunction(() => document.querySelector('#admin-chat-message').disabled);
  releaseSend();
  await ap.waitForFunction(() => document.querySelector('#admin-chat-message').value === '' && !document.querySelector('#admin-chat-message').disabled);
  chatPlan.barrier = null;
  assert.equal(chatPlan.sends.length, 2, 'Un fallo y un reintento; sin envíos duplicados');
  assert.equal(chatPlan.sends[1].body, firstDraft);
  assert.equal(chatPlan.sends[1].user_id, uid(301));
  await ap.getByRole('button', { name: 'Volver a conversaciones', exact: true }).click();
  await chatRows.nth(1).click();
  assert.equal(await composer.inputValue(), 'Borrador del segundo jugador');
  await ap.getByRole('button', { name: 'Volver a conversaciones', exact: true }).click();
  await chatRows.first().click();
  assert.ok(admin.calls.filter(call => call.path.endsWith('/request_summaries') && call.query.user_id).some(call => call.query.status === 'eq.pending' && call.query.limit === '3'));
  await ap.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await ap.screenshot({ path: '/tmp/gana777-browser-checks/admin-chat.png', fullPage: true });
  for (const [width, height] of [[1440, 900], [1366, 768], [1100, 700], [1024, 600], [955, 900], [390, 844], [320, 700]]) {
    await ap.setViewportSize({ width, height });
    await ap.waitForTimeout(100);
    assert.ok(await ap.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Atención sin desborde horizontal a ${width}px`);
    assert.ok(await ap.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), `Atención cabe en ${width}x${height} sin bajar la página: ${JSON.stringify(await ap.evaluate(() => ({ height: innerHeight, doc: document.documentElement.scrollHeight, html: getComputedStyle(document.documentElement).height, body: document.body.getBoundingClientRect().height, bodyMin: getComputedStyle(document.body).minHeight, root: document.getElementById('root')?.getBoundingClientRect().height, shell: document.querySelector('.attention-shell')?.getBoundingClientRect().height })))}`);
    assert.ok(await composer.evaluate(element => element.getBoundingClientRect().bottom <= innerHeight && element.getBoundingClientRect().top >= 0 && element.getBoundingClientRect().right <= innerWidth + 1), 'Respuesta dentro de la pantalla');
    assert.ok(await ap.locator('.admin-chat-layout').evaluate(element => element.getBoundingClientRect().right <= innerWidth + 1), 'Panel completo dentro del ancho visible');
    assert.ok(await ap.locator('.regular-chat-admin-view .admin-chat-messages').evaluate(element => element.clientHeight >= 100), 'Espacio útil para leer mensajes');
    await ap.evaluate(() => document.activeElement?.blur());
    await ap.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await ap.screenshot({ path: `/tmp/gana777-browser-checks/attention-compact-${width}.png` });
    await ap.getByRole('button', { name: 'Ver datos del jugador', exact: true }).click();
    assert.ok(await ap.getByRole('dialog', { name: 'Datos del jugador', exact: true }).isVisible());
    assert.ok(await ap.getByRole('dialog', { name: 'Datos del jugador', exact: true }).evaluate(element => element.getBoundingClientRect().bottom <= innerHeight + 1), 'Ficha dentro de la pantalla');
    await ap.keyboard.press('Escape');
    assert.equal(await ap.getByRole('dialog', { name: 'Datos del jugador', exact: true }).count(), 0);
    await ap.getByRole('button', { name: 'Volver a conversaciones', exact: true }).click();
    assert.ok(await ap.locator('.regular-chat-admin-view .admin-chat-inbox').isVisible());
    assert.equal(await ap.locator('.regular-chat-admin-view .admin-chat-thread').isVisible(), false);
    await ap.screenshot({ path: `/tmp/gana777-browser-checks/attention-list-${width}.png` });
    await chatRows.first().click();
  }
  await ap.setViewportSize({ width: 1440, height: 1000 });
  await ap.getByRole('button', { name: 'Volver a conversaciones', exact: true }).click();
  await chatRows.nth(1).click();
  await ap.getByRole('button', { name: 'Ver datos del jugador', exact: true }).click();
  await ap.getByText('No hay operaciones pendientes.', { exact: true }).waitFor();
  await ap.getByRole('button', { name: 'Ver historial', exact: true }).click();
  await ap.getByRole('group', { name: 'Tipo de operación del historial' }).getByRole('button', { name: 'Retiros', exact: true }).click();
  await ap.getByText('Este jugador todavía no tiene retiros.', { exact: true }).waitFor();
  for (const width of [1024, 390]) {
    await ap.setViewportSize({ width, height: 900 });
    await ap.waitForTimeout(100);
    await ap.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await ap.waitForFunction(() => { const pane = document.querySelector('.attention-player-dialog'); return pane && pane.getBoundingClientRect().height > 0 && pane.getBoundingClientRect().bottom <= innerHeight + 1; });
    assert.ok(await ap.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await ap.locator('.attention-player-context').screenshot({ path: `/tmp/gana777-browser-checks/attention-player-empty-${width}.png` });
  }
  await ap.setViewportSize({ width: 1440, height: 1000 });
  await ap.getByRole('button', { name: 'Cerrar datos del jugador', exact: true }).click();
  await ap.getByRole('navigation', { name: 'Bandejas de atención' }).getByRole('button', { name: /^Solicitudes de acceso/ }).click();
  await ap.waitForSelector('.access-admin-item');
  assert.equal(await ap.locator('.access-admin-item').count(), 4);
  assert.equal(await ap.locator('.access-admin-thread').isVisible(), false);
  const accessFilter = ap.getByRole('group', { name: 'Filtrar solicitudes', exact: true });
  await accessFilter.getByRole('button', { name: 'Por configurar', exact: true }).click();
  assert.equal(await ap.locator('.access-admin-item').count(), 2);
  await ap.getByRole('textbox', { name: 'Buscar solicitud', exact: true }).fill('solicitante0');
  assert.equal(await ap.locator('.access-admin-item').count(), 1);
  await ap.getByRole('button', { name: 'Abrir solicitud de solicitante0', exact: true }).click();
  await ap.locator('.access-admin-message').waitFor();
  assert.equal(await ap.locator('.access-admin-inbox').isVisible(), false);
  assert.equal(await ap.locator('.access-admin-thread').isVisible(), true);
  assert.equal(await ap.locator('.access-admin-create').getByRole('textbox', { name: 'Usuario para el acceso' }).inputValue(), 'solicitante0');
  assert.ok(await ap.getByRole('button', { name: 'Crear usuario y enviar acceso', exact: true }).isVisible());
  for (const width of [1440, 955, 390, 320]) {
    await ap.setViewportSize({ width, height: 820 }); await ap.waitForTimeout(100);
    assert.ok(await ap.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await ap.locator('.access-admin-layout').evaluate(el => el.getBoundingClientRect().right <= innerWidth + 1 && el.getBoundingClientRect().bottom <= innerHeight + 1));
    await ap.screenshot({ path: `/tmp/gana777-browser-checks/access-detail-${width}.png` });
  }
  await ap.getByRole('button', { name: 'Volver a solicitudes', exact: true }).click();
  assert.equal(await ap.locator('.access-admin-thread').isVisible(), false);
  assert.equal(await ap.getByRole('textbox', { name: 'Buscar solicitud', exact: true }).inputValue(), 'solicitante0');
  assert.equal(await accessFilter.getByRole('button', { name: 'Por configurar', exact: true }).getAttribute('aria-pressed'), 'true');
  await ap.getByRole('textbox', { name: 'Buscar solicitud', exact: true }).fill('');
  await accessFilter.getByRole('button', { name: 'Todas', exact: true }).click();
  await ap.waitForFunction(() => document.querySelectorAll('.access-admin-item').length === 4);
  assert.equal(await ap.locator('.access-admin-item').count(), 4);
  await ap.setViewportSize({ width: 955, height: 820 }); await ap.waitForTimeout(100);
  await ap.screenshot({ path: '/tmp/gana777-browser-checks/access-list.png' });
  await ap.getByRole('button', { name: 'Crear usuario', exact: true }).click();
  assert.equal(await ap.locator('.access-admin-inbox').isVisible(), false);
  await ap.locator('.access-admin-manual-form').waitFor();
  await ap.getByRole('button', { name: 'Volver a solicitudes', exact: true }).click();
  assert.equal(await ap.locator('.access-admin-inbox').isVisible(), true);
  await ap.getByRole('button', { name: 'Abrir solicitud de solicitante2', exact: true }).click();
  await ap.getByRole('button', { name: 'Guardar y enviar nuevos datos', exact: true }).waitFor();
  assert.equal(await ap.locator('.access-admin-create').getByRole('textbox', { name: 'Usuario para el acceso' }).getAttribute('readonly'), '');
  await ap.getByRole('button', { name: 'Volver a solicitudes', exact: true }).click();
  await ap.setViewportSize({ width: 1440, height: 1000 });
  await ap.getByRole('navigation', { name: 'Bandejas de atención' }).getByRole('button', { name: /^Chat externo/ }).click();
  await ap.waitForSelector('.external-chat-admin-view .admin-chat-item');
  await ap.locator('.external-chat-admin-view .admin-chat-item').first().click();
  await ap.waitForSelector('.external-chat-admin-view .message');
  await ap.getByRole('button', { name: 'Ver mensajes anteriores', exact: true }).click();
  await ap.waitForFunction(() => document.querySelectorAll('.external-chat-admin-view .message').length === 100);
  await ap.getByRole('button', { name: 'Salir', exact: true }).click();
  await ap.waitForSelector('.admin-login');
  assert.equal(await ap.locator('.admin-chat-item, .player-card').count(), 0);
  assert.deepEqual(admin.errors, []);
  records.push({ app: 'admin-desktop', checks: ['20 players per page', 'server search finds old player', '10 withdrawals per queue', 'parts restricted to visible ids', '50 conversations per page', 'older chat messages', 'editable quick replies', 'per-player drafts', 'failed send preserves text', 'duplicate send blocked', 'operation details', 'on-demand paginated player history', 'external chat pagination', 'logout clears private screens'], requests: admin.calls.length });
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
  const queue = { version: 9200, events: [], rows: Array.from({ length: 75 }, (_, i) => ({ ...requestRows[0], id: uid(20000 + i), user_name: `Carga compartida ${i}`, amount: i === 0 ? 10000 : requestRows[0].amount, bonus_percent: i === 0 ? 50 : 0, status: i === 2 ? 'approved' : 'pending', receipt_path: i === 0 ? 'mock/receipt.jpg' : null, created_at: stamp(75 - i), claimed_by: i === 1 ? uid(9001) : null, claimed_name: i === 1 ? 'Bea' : null, claim_token: i === 1 ? uid(9199) : null })) };
  queue.rows.reverse();
  const expectedDeposits = queue.rows.filter(row => row.status === 'pending' && !row.claimed_by).sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const shared = await openApp(true, false, queue);
  const qp = shared.page;
  const qnav = qp.getByRole('navigation', { name: 'Navegación principal', exact: true });
  assert.equal(shared.calls.filter(call => call.path.endsWith('/list_deposit_queue')).length, 0, 'Inicio no descarga la bandeja');
  await qnav.getByRole('button', { name: /^Cargas/ }).click();
  await qp.waitForFunction(() => document.querySelectorAll('.load-request-button').length === 30);
  assert.equal(await qp.locator('.sac-board').count(), 0);
  assert.equal(await qp.locator('.request-summary-user strong').first().innerText(), expectedDeposits[0].user_name);
  await qp.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await qp.waitForFunction(() => document.querySelector('.loads-pager')?.textContent.includes('Página 2'));
  await qp.waitForFunction(name => document.querySelector('.request-summary-user strong')?.textContent === name, expectedDeposits[30].user_name);
  await qp.getByRole('button', { name: 'Anterior', exact: true }).click();
  await qp.waitForFunction(() => document.querySelector('.loads-pager')?.textContent.includes('Página 1'));
  await qp.waitForFunction(name => document.querySelector('.request-summary-user strong')?.textContent === name, expectedDeposits[0].user_name);
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
  await qp.waitForSelector('.load-modal', { state: 'detached' });
  await qp.getByRole('tab', { name: 'Todas', exact: true }).click();
  const completed = qp.getByRole('button', { name: /Carga compartida 2 / });
  assert.match(await completed.innerText(), /Cargada/);
  await completed.click();
  await qp.waitForSelector('.deposit-claim-status');
  assert.equal(await qp.getByRole('button', { name: 'Confirmar carga', exact: true }).count(), 0, 'El historial no vuelve a pedir la carga');
  await qp.keyboard.press('Escape');
  await qp.waitForSelector('.load-modal', { state: 'detached' });
  await qp.getByRole('button', { name: /Carga compartida 0 / }).click();
  assert.equal(await qp.locator('.deposit-credit-card').count(), 0, 'El comprobante no repite los datos de acreditación');
  await qp.getByRole('button', { name: 'Confirmar carga', exact: true }).click();
  await qp.waitForSelector('.load-modal', { state: 'detached' });
  await qp.waitForSelector('.credit-ready-modal');
  assert.match(await qp.locator('.credit-ready-modal').innerText(), /TOTAL A ACREDITAR[\s\S]*15\.000/);
  await qp.keyboard.press('Escape');
  await qp.waitForSelector('.credit-ready-modal', { state: 'detached' });
  await qp.getByRole('button', { name: /Carga compartida 1 / }).click();
  await qp.waitForSelector('.deposit-claim-status');
  assert.ok((await qp.locator('.deposit-claim-status').innerText()).includes('Bea'));
  assert.equal(await qp.getByRole('button', { name: 'Confirmar carga', exact: true }).count(), 0);
  assert.equal(await qp.getByRole('button', { name: 'Revisar y asumir carga', exact: true }).count(), 0);
  assert.equal(await qp.getByText('Requiere revisión del supervisor').count(), 0);
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
  await qp.getByRole('button', { name: /Carga compartida 3 / }).click();
  await qp.getByRole('button', { name: 'Confirmar carga', exact: true }).waitFor();
  let finishReview;
  queue.reviewBarrier = new Promise(resolve => { finishReview = resolve; });
  const reviewSent = qp.waitForRequest(request => request.url().endsWith('/rpc/review_queue_deposit'));
  const reviewReceived = qp.waitForResponse(response => response.url().endsWith('/rpc/review_queue_deposit'));
  await qp.getByRole('button', { name: 'Confirmar carga', exact: true }).click();
  await reviewSent;
  await qp.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
  await qnav.getByRole('button', { name: 'Inicio', exact: true }).click();
  await qp.waitForSelector('.admin-overview');
  delete queue.reviewBarrier; finishReview();
  await reviewReceived;
  await qp.waitForFunction(() => !document.querySelector('.admin-refresh')?.disabled);
  await qnav.getByRole('button', { name: /^Cargas/ }).click();
  await qp.getByRole('button', { name: /Carga compartida 1 / }).waitFor();
  assert.equal(await qp.locator('.credit-ready-modal').count(), 0, 'Una aprobación tardía no reabre una ventana después de navegar');
  assert.deepEqual(shared.errors, []);
  records.push({ app: 'shared-deposit-queue', checks: ['30 rows per page', 'newest deposits first across pages', 'completed history in Todas', 'no SAC selector', 'server-confirmed take', 'explicit release', 'close returns to disponibles', 'take conflict', 'one step load', 'foreign claim read-only', 'no supervisor step', 'audit on demand', 'mobile without overflow', 'late approval does not reopen a dismissed screen'] });
  await shared.context.close();
  const legacyBonusPlan = { offers: [], scheduleSupported: false };
  const legacyBonus = await openApp(true, false, null, legacyBonusPlan);
  const lp = legacyBonus.page;
  await lp.getByRole('navigation', { name: 'Navegación principal', exact: true }).getByRole('button', { name: 'Bonos', exact: true }).click();
  await lp.locator('input[name="title"]').fill('Bono sin horario');
  await lp.locator('input[name="value"]').fill('50');
  await lp.locator('input[name="min_amount"]').fill('1.000');
  await lp.locator('input[name="max_amount"]').fill('50.000');
  await lp.getByRole('button', { name: 'Crear bono', exact: true }).click();
  await lp.waitForSelector('.bonus-offer');
  assert.equal(legacyBonusPlan.saved.bonus_percent, 50);
  assert.equal('bonus_start_time' in legacyBonusPlan.saved, false);
  await lp.getByRole('button', { name: 'Editar', exact: true }).click();
  const saveLegacy = lp.getByRole('button', { name: 'Guardar cambios', exact: true });
  assert.equal(await saveLegacy.isEnabled(), true, 'Sin horario se puede guardar con el esquema actual');
  await lp.getByRole('checkbox', { name: 'Disponible solo en un horario', exact: true }).check();
  await lp.locator('#bonus-schedule-save-notice').waitFor();
  const mutationCount = () => legacyBonus.calls.filter(call => call.path.endsWith('/promotions') && ['POST','PATCH'].includes(call.method)).length;
  const beforeBlockedSave = mutationCount();
  await saveLegacy.click();
  await lp.getByRole('alert').filter({ hasText: 'Los horarios todavía no están habilitados' }).waitFor();
  assert.equal(mutationCount(), beforeBlockedSave, 'No se guarda una franja sin soporte de servidor');
  await lp.getByRole('checkbox', { name: 'Disponible solo en un horario', exact: true }).uncheck();
  assert.equal(await lp.locator('#bonus-schedule-save-notice').count(), 0);
  await lp.locator('input[name="title"]').fill('Bono editado sin horario');
  await saveLegacy.click();
  await lp.locator('.bonus-offer > div > strong').filter({ hasText: 'Bono editado sin horario' }).waitFor();
  assert.equal(mutationCount(), beforeBlockedSave + 1);
  assert.equal('bonus_start_time' in legacyBonusPlan.saved, false);
  assert.deepEqual(legacyBonus.errors, []);
  await legacyBonus.context.close();
  records.push({ app: 'legacy-bonus-save', checks: ['create without schedule', 'edit without schedule', 'clear reason when schedule unavailable', 'no unsupported write', 'uncheck schedule and save changes'] });
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
  assert.doesNotMatch(await pp.locator('.player-bonus-card').innerText(), /hora de Paraguay|14:00[–-]17:00/);
  assert.equal(await pp.locator('.player-bonus-card [role="timer"]').count(), 0, 'El bono activo muestra su botón sin texto horario adicional');
  await pp.getByRole('button', { name: 'Ver información de Tarde 50%', exact: true }).click();
  assert.doesNotMatch(await pp.locator('.player-bonus-rules-dialog').innerText(), /Paraguay|Todos los días|14:00[–-]17:00/);
  await pp.getByRole('button', { name: 'Cerrar información', exact: true }).click();
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
  const countdownPlan = { offers: bonusPlan.offers.map(offer => ({ ...offer })), now: '2026-11-07T13:59:50-03:00' };
  const countdownApp = await openApp(false, true, null, countdownPlan);
  const cp = countdownApp.page;
  await cp.getByRole('button', { name: /Bonos disponibles/ }).click();
  const bonusTimer = cp.getByRole('timer', { name: 'Tiempo hasta que el bono esté disponible', exact: true });
  await bonusTimer.waitFor();
  assert.doesNotMatch(await cp.locator('.player-bonus-card').innerText(), /hora de Paraguay|14:00[–-]17:00/);
  assert.equal(await cp.getByRole('button', { name: 'Obtener', exact: true }).count(), 0);
  const databaseCalls = () => countdownApp.calls.filter(call => call.path.includes('/rest/')).length;
  const beforeCountdown = databaseCalls();
  const firstCountdown = await bonusTimer.innerText();
  await cp.clock.fastForward(1000);
  assert.notEqual(await bonusTimer.innerText(), firstCountdown);
  assert.equal(databaseCalls(), beforeCountdown, 'Actualizar los segundos no consulta la base');
  await cp.screenshot({ path: '/tmp/gana777-browser-checks/bonus-countdown.png', fullPage: false });
  await cp.clock.fastForward(10_000);
  await cp.getByRole('button', { name: 'Obtener', exact: true }).waitFor();
  assert.equal(await bonusTimer.count(), 0);
  assert.equal(databaseCalls(), beforeCountdown, 'Abrir la franja no consulta la base');
  await cp.screenshot({ path: '/tmp/gana777-browser-checks/bonus-available.png', fullPage: false });
  assert.deepEqual(countdownApp.errors, []);
  await countdownApp.context.close();
  records.push({ app: 'bonus-local-countdown', checks: ['no duplicated schedule text', 'local seconds countdown', 'no database call per tick', 'automatic availability', 'no database call at opening'] });
  const offsetOffer = { ...bonusPlan.offers[0], bonus_mode: 'fixed', bonus_percent: 0, bonus_amount: 1000, cooldown_hours: 6 };
  const offsetPlan = { offers: [offsetOffer], now: '2026-11-07T16:59:50-03:00', clockOffset: -2000, availability: [{ promotion_id: offsetOffer.id, next_available_at: null, awaiting_credit: false }] };
  const offsetApp = await openApp(false, true, null, offsetPlan);
  const op = offsetApp.page;
  await op.getByRole('button', { name: /Bonos disponibles/ }).click();
  await op.getByRole('button', { name: 'Obtener', exact: true }).waitFor();
  const beforeOffset = offsetApp.calls.filter(call => call.path.includes('/rest/')).length;
  await op.clock.fastForward(15_000);
  await op.getByRole('timer', { name: 'Tiempo hasta que el bono esté disponible', exact: true }).waitFor();
  assert.equal(await op.getByRole('button', { name: 'Obtener', exact: true }).count(), 0, 'El cierre usa también la corrección del reloj del servidor');
  assert.equal(offsetApp.calls.filter(call => call.path.includes('/rest/')).length, beforeOffset);
  assert.deepEqual(offsetApp.errors, []);
  await offsetApp.context.close();
  records.push({ app: 'bonus-server-clock', checks: ['schedule boundary with server clock offset', 'no query at corrected boundary'] });
  const receiptPlan = { offers: [], receipt: { submissions: 0, failNext: true } };
  const receiptApp = await openApp(false, true, null, receiptPlan);
  const rp = receiptApp.page;
  await rp.getByRole('button', { name: /^Cargar/ }).click();
  await rp.getByLabel('¿Cuánto querés cargar?', { exact: true }).fill('10.000');
  await rp.getByRole('button', { name: 'Continuar', exact: true }).click();
  await rp.getByRole('button', { name: 'Ya transferí · subir comprobante', exact: true }).click();
  const pickPhoto = rp.getByRole('button', { name: 'Elegir foto del comprobante', exact: true });
  await pickPhoto.waitFor();
  assert.equal(await rp.getByRole('button', { name: 'Enviar para revisión', exact: true }).count(), 0);
  assert.equal(await rp.locator('.modern-receipt-pick').evaluate(element => { const r = element.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), true, 'La acción principal aparece sin buscarla debajo de la pantalla');
  await rp.screenshot({ path: '/tmp/gana777-browser-checks/receipt-choose-mobile.png', fullPage: false });
  const cancelChoice = rp.waitForEvent('filechooser');
  await pickPhoto.click();
  await (await cancelChoice).setFiles([]);
  assert.equal(receiptPlan.receipt.submissions, 0);
  await rp.locator('.modern-receipt-input').setInputFiles({ name: 'invalida.png', mimeType: 'image/png', buffer: Buffer.from('imagen dañada') });
  await rp.getByRole('alert').filter({ hasText: 'No pudimos leer esa imagen' }).waitFor();
  assert.equal(await pickPhoto.count(), 1);
  const receiptData = await rp.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 470;
    const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, 420, 470);
    context.fillStyle = '#243326'; context.font = 'bold 22px sans-serif'; context.fillText('COMPROBANTE DE PRUEBA', 24, 50);
    context.font = '16px sans-serif'; context.fillText('Sin validez · datos simulados', 24, 82);
    context.fillStyle = '#333333'; context.font = 'bold 40px sans-serif'; context.fillText('$ 10.000', 24, 170);
    context.font = '18px sans-serif'; context.fillText('Transferencia de prueba', 24, 235); context.fillText('Cuenta de prueba', 24, 275);
    context.fillText('07/11/2026 · 14:30', 24, 315); context.fillText('Solo para verificar la interfaz', 24, 410);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const photo = { name: 'comprobante-prueba.png', mimeType: 'image/png', buffer: Buffer.from(receiptData, 'base64') };
  const choosePhoto = rp.waitForEvent('filechooser');
  await pickPhoto.click(); await (await choosePhoto).setFiles(photo);
  const sendReceipt = rp.getByRole('button', { name: 'Enviar para revisión', exact: true });
  await sendReceipt.waitFor();
  await rp.locator('.modern-receipt-preview').waitFor();
  assert.equal(receiptPlan.receipt.submissions, 0, 'Elegir la foto no envía la solicitud');
  const previewSource = await rp.locator('.modern-receipt-preview').getAttribute('src');
  const cancelReplacement = rp.waitForEvent('filechooser');
  await rp.getByRole('button', { name: 'Cambiar foto', exact: true }).click(); await (await cancelReplacement).setFiles([]);
  assert.equal(await rp.locator('.modern-receipt-preview').getAttribute('src'), previewSource);
  await rp.locator('.modern-receipt-input').setInputFiles({ name: 'otra-invalida.png', mimeType: 'image/png', buffer: Buffer.from('no es una imagen') });
  await rp.getByRole('alert').filter({ hasText: 'La foto anterior sigue seleccionada' }).waitFor();
  assert.equal(await rp.locator('.modern-receipt-preview').getAttribute('src'), previewSource);
  await rp.locator('.modern-receipt-input').setInputFiles({ ...photo, name: 'comprobante-cambiado.png' });
  await rp.getByRole('button', { name: 'Enviar para revisión', exact: true }).waitFor();
  assert.equal(await rp.getByRole('alert').count(), 0);
  await rp.screenshot({ path: '/tmp/gana777-browser-checks/receipt-selected-mobile.png', fullPage: false });
  await rp.setViewportSize({ width: 320, height: 740 });
  assert.ok(await rp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await rp.setViewportSize({ width: 1280, height: 900 });
  await rp.screenshot({ path: '/tmp/gana777-browser-checks/receipt-selected-desktop.png', fullPage: false });
  await rp.setViewportSize({ width: 390, height: 844 });
  let finishReceipt;
  receiptPlan.receipt.barrier = new Promise(resolve => { finishReceipt = resolve; });
  const receiptSent = rp.waitForRequest(request => request.url().endsWith('/functions/v1/submit-deposit'));
  await sendReceipt.click(); await receiptSent;
  await rp.getByRole('button', { name: 'Enviando comprobante…', exact: true }).waitFor();
  assert.equal(await rp.getByRole('button', { name: 'Enviando comprobante…', exact: true }).isDisabled(), true);
  await rp.evaluate(() => { const form = document.querySelector('.modern-deposit-flow'); form.requestSubmit(); form.requestSubmit(); });
  assert.equal(receiptPlan.receipt.submissions, 1, 'Los toques repetidos no duplican el envío');
  delete receiptPlan.receipt.barrier; finishReceipt();
  await rp.getByRole('button', { name: 'Reintentar envío', exact: true }).waitFor();
  assert.equal(await rp.locator('.modern-receipt-preview').count(), 1, 'El error conserva la foto seleccionada');
  await rp.screenshot({ path: '/tmp/gana777-browser-checks/receipt-retry-mobile.png', fullPage: false });
  await rp.getByRole('button', { name: 'Reintentar envío', exact: true }).click();
  await rp.getByRole('heading', { name: 'Comprobante enviado', exact: true }).waitFor();
  assert.equal(receiptPlan.receipt.submissions, 2);
  assert.equal(receiptPlan.receipt.fields.amount, '10000');
  assert.equal(receiptPlan.receipt.fields.assignment, uid(999));
  assert.ok(receiptPlan.receipt.fields.fileSize > 0);
  assert.equal(await rp.locator('.modern-receipt-send, .modern-receipt-pick, .modern-receipt-preview').count(), 0);
  await rp.evaluate(() => document.querySelector('.modern-deposit-flow').requestSubmit());
  assert.equal(receiptPlan.receipt.submissions, 2);
  await rp.screenshot({ path: '/tmp/gana777-browser-checks/receipt-success-mobile.png', fullPage: false });
  assert.deepEqual(receiptApp.errors, []);
  records.push({ app: 'receipt-upload', checks: ['large visible gallery action', 'cancel picker', 'invalid photo', 'preview before sending', 'cancel replacement preserves photo', 'failed replacement preserves photo', 'mobile 320 px', 'desktop preview', 'duplicate submit blocked', 'error keeps photo', 'explicit retry', 'clear success confirmation'] });
  await receiptApp.context.close();
  writeFileSync('/tmp/gana777-browser-checks/results.json', JSON.stringify(records, null, 2));
  console.log(JSON.stringify(records, null, 2));
} catch (error) {
  const last = browser.contexts().at(-1)?.pages().at(-1);
  if (last) { console.error((await last.locator('body').innerText()).slice(0, 5000)); await last.screenshot({ path: '/tmp/gana777-browser-checks/failure.png', fullPage: true }).catch(() => {}); }
  if (last) console.error(JSON.stringify(await last.evaluate(() => [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 && r.left < innerWidth && r.width > 0; }).slice(0, 16).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width }))), null, 2));
  throw error;
} finally { await browser.close(); }
