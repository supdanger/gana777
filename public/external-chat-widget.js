(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || document.getElementById('gana777-external-chat')) return;
  var api = script.dataset.endpoint;
  var key = script.dataset.key;
  if (!api || !key) return;
  if (!document.body) {
    var source = script;
    document.addEventListener('DOMContentLoaded', function () {
      var deferred = document.createElement('script');
      deferred.src = source.src;
      deferred.dataset.endpoint = api;
      deferred.dataset.key = key;
      document.head.appendChild(deferred);
    }, { once: true });
    return;
  }
  var token = null;
  var sessionKey = 'gana777_external_chat_v1';
  var messages = [];
  var isOpen = false;
  var busy = false;
  var timer = null;
  var sessionReady = null;

  try { token = JSON.parse(localStorage.getItem(sessionKey) || 'null')?.token || null; } catch (_) {}

  var host = document.createElement('div');
  host.id = 'gana777-external-chat';
  host.style.cssText = 'position:fixed;z-index:2147483000;right:18px;bottom:18px;width:0;height:0;';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>' +
    ':host{all:initial;font-family:Arial,Helvetica,sans-serif;color:#eff7ff}*{box-sizing:border-box}' +
    '.launcher{position:absolute;right:0;bottom:0;width:62px;height:62px;border:0;border-radius:50%;background:linear-gradient(145deg,#22b7ee,#0674d5);color:#fff;box-shadow:0 8px 28px #001b3d99;cursor:pointer;display:grid;place-items:center}' +
    '.launcher svg{width:29px;height:29px}.panel{position:absolute;right:0;bottom:76px;width:min(360px,calc(100vw - 28px));height:min(500px,calc(100vh - 112px));border:1px solid #33759b;border-radius:18px;background:#081c2c;box-shadow:0 18px 54px #000a;display:none;overflow:hidden}' +
    '.panel.open{display:flex;flex-direction:column}.head{height:68px;flex:0 0 68px;padding:12px 15px;background:linear-gradient(110deg,#103d59,#0c263c);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #24516e}' +
    '.identity strong{display:block;font-size:15px}.identity small{display:block;margin-top:4px;color:#b6cee2;font-size:11px}.close{border:0;background:transparent;color:#c9e1f3;font-size:25px;cursor:pointer}' +
    '.log{flex:1;overflow:auto;padding:15px 12px;display:flex;flex-direction:column;gap:10px}.hint{margin:auto 0;text-align:center;color:#a8c3d7;font-size:13px;line-height:1.45}' +
    '.bubble{max-width:84%;align-self:flex-start;background:#173a53;border-radius:13px 13px 13px 3px;padding:10px 12px;font-size:13px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere}.bubble.staff{align-self:flex-end;background:#0879c7;border-radius:13px 13px 3px 13px}' +
    '.bubble time{display:block;margin-top:5px;font-size:10px;color:#c2d7e8}.composer{display:flex;gap:8px;padding:11px;border-top:1px solid #234760;background:#0a2031}' +
    '.composer textarea{resize:none;min-width:0;flex:1;height:42px;max-height:86px;border:1px solid #355970;border-radius:12px;background:#0d293e;color:#fff;padding:11px;font:13px Arial;outline:none}.composer textarea:focus{border-color:#33bfff}' +
    '.composer button{width:42px;border:0;border-radius:12px;background:#0a91dc;color:white;cursor:pointer}.composer button:disabled{opacity:.5;cursor:wait}.status{min-height:16px;padding:0 12px 6px;color:#ffc0a9;font-size:11px}' +
    '@media(max-width:480px){:host{right:12px!important;bottom:12px!important}.panel{right:-2px;width:calc(100vw - 24px);height:min(520px,calc(100vh - 100px))}}' +
    '</style><button class="launcher" type="button" aria-label="Abrir chat de soporte" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg></button>' +
    '<section class="panel" aria-label="Chat de soporte"><header class="head"><div class="identity"><strong>Soporte GANA777</strong><small class="nickname">Chat disponible</small></div><button class="close" type="button" aria-label="Cerrar chat">×</button></header><div class="log" role="log" aria-live="polite"><p class="hint">Escribinos y te ayudamos por acá.</p></div><div class="status" role="status"></div><form class="composer"><textarea maxlength="2000" placeholder="Escribí tu mensaje…" aria-label="Escribí tu mensaje" required></textarea><button type="submit" aria-label="Enviar mensaje"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg></button></form></section>';
  document.body.appendChild(host);

  var launcher = root.querySelector('.launcher');
  var panel = root.querySelector('.panel');
  var log = root.querySelector('.log');
  var form = root.querySelector('.composer');
  var input = root.querySelector('textarea');
  var send = root.querySelector('.composer button');
  var status = root.querySelector('.status');
  var nickname = root.querySelector('.nickname');

  function draw() {
    var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.textContent = '';
    if (!messages.length) {
      var hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = 'Escribinos y te ayudamos por acá.'; log.appendChild(hint);
    }
    messages.forEach(function (message) {
      var bubble = document.createElement('div'); bubble.className = 'bubble' + (message.sender_type === 'staff' ? ' staff' : '');
      var text = document.createElement('span'); text.textContent = message.body; bubble.appendChild(text);
      var time = document.createElement('time'); time.textContent = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at)); bubble.appendChild(time);
      log.appendChild(bubble);
    });
    if (atBottom) log.scrollTop = log.scrollHeight;
  }

  function merge(incoming) {
    if (!Array.isArray(incoming)) return;
    var seen = new Set(messages.map(function (message) { return message.id; }));
    incoming.forEach(function (message) { if (!seen.has(message.id)) { messages.push(message); seen.add(message.id); } });
    messages.sort(function (a, b) { return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id); });
    draw();
  }

  async function call(action, extra) {
    var response = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key }, body: JSON.stringify(Object.assign({ action: action, token: token }, extra || {})) });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || 'No pudimos conectar con el chat.');
    return data;
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    try { var data = await call('read'); nickname.textContent = data.nickname; merge(data.messages); status.textContent = ''; }
    catch (error) { status.textContent = error.message || 'No pudimos actualizar el chat.'; }
    finally { busy = false; }
    if (isOpen && !timer) timer = setInterval(refresh, 5000);
  }

  async function start() {
    var data = await call('start'); token = data.token;
    localStorage.setItem(sessionKey, JSON.stringify({ token: token }));
    nickname.textContent = data.nickname; merge(data.messages);
  }

  function ensureSession() {
    if (!sessionReady) sessionReady = start().catch(function (error) { sessionReady = null; throw error; });
    return sessionReady;
  }

  function setOpen(value) {
    isOpen = value; panel.classList.toggle('open', value); launcher.setAttribute('aria-expanded', String(value));
    if (value) { input.focus(); void ensureSession().then(refresh).catch(function (error) { status.textContent = error.message || 'El chat no está disponible en este momento.'; }); }
    else if (timer) { clearInterval(timer); timer = null; }
  }
  launcher.addEventListener('click', function () { setOpen(!isOpen); });
  root.querySelector('.close').addEventListener('click', function () { setOpen(false); });
  form.addEventListener('submit', async function (event) {
    event.preventDefault(); var body = input.value.trim(); if (!body || busy) return;
    busy = true; send.disabled = true; status.textContent = '';
    try { await ensureSession(); var data = await call('send', { body: body }); input.value = ''; merge(data.messages); }
    catch (error) { status.textContent = error.message || 'No pudimos enviar el mensaje.'; }
    finally { busy = false; send.disabled = false; input.focus(); }
  });
})();
