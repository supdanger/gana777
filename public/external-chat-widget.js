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
  root.innerHTML = `<style>
    :host{all:initial;color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#f3f8ff}
    *{box-sizing:border-box}
    .launcher{position:absolute;right:0;bottom:0;display:grid;place-items:center;width:62px;height:62px;border:1px solid #83dbff;border-radius:50%;background:linear-gradient(145deg,#25b9f1,#0878c7);color:#fff;box-shadow:0 10px 28px #001b3d88,0 0 0 5px #20a6df19;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}
    .launcher:hover{transform:translateY(-2px);box-shadow:0 14px 34px #001b3daa,0 0 0 7px #20a6df22}
    .launcher:focus-visible,.close:focus-visible,.composer button:focus-visible{outline:2px solid #b5edff;outline-offset:3px}
    .launcher svg{width:27px;height:27px}
    .panel{position:absolute;right:0;bottom:78px;display:none;flex-direction:column;width:min(390px,calc(100vw - 28px));height:min(560px,calc(100vh - 108px));overflow:hidden;border:1px solid #356986;border-radius:21px;background:#0b1c29;box-shadow:0 22px 70px #0009,0 0 0 1px #c2e8ff12}
    .panel.open{display:flex;animation:chat-in .2s cubic-bezier(.2,.8,.2,1)}
    @keyframes chat-in{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
    .head{position:relative;display:flex;align-items:center;gap:12px;min-height:82px;padding:15px 16px;background:linear-gradient(125deg,#123c55,#102b40 66%,#102337);border-bottom:1px solid #244a61}
    .brand-mark{display:grid;place-items:center;flex:0 0 46px;width:46px;height:46px;border:1px solid #58bce2;border-radius:15px;background:linear-gradient(145deg,#1e6280,#153d58);color:#dff7ff;box-shadow:inset 0 1px #ffffff22,0 5px 14px #00152255}
    .brand-mark svg{width:25px;height:25px}
    .identity{min-width:0;flex:1;padding-right:30px}
    .identity strong{display:block;overflow:hidden;color:#fff;font-size:15px;font-weight:750;letter-spacing:.01em;text-overflow:ellipsis;white-space:nowrap}
    .identity small{display:block;margin-top:4px;color:#aec9dc;font-size:11px;letter-spacing:.02em}
    .visitor{display:inline-flex;align-items:center;gap:6px;margin-top:7px;padding:3px 8px;border:1px solid #45677d;border-radius:999px;background:#0b2233;color:#9db9ca;font-size:10px}
    .visitor-label{color:#6e9bb3;text-transform:uppercase;letter-spacing:.07em;font-size:9px;font-weight:750}
    .nickname{color:#d8effb;font-weight:650}
    .close{position:absolute;top:14px;right:13px;display:grid;place-items:center;width:34px;height:34px;border:1px solid transparent;border-radius:10px;background:transparent;color:#b9d0df;cursor:pointer;transition:background .16s ease,color .16s ease,border-color .16s ease}
    .close:hover{border-color:#45667a;background:#17364b;color:#fff}
    .close svg{width:18px;height:18px}
    .log{display:flex;flex:1;flex-direction:column;gap:12px;overflow:auto;padding:18px 15px 16px;scrollbar-color:#31566b transparent;scrollbar-width:thin}
    .welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;min-height:180px;padding:26px 22px;text-align:center}
    .welcome-mark{display:grid;place-items:center;width:48px;height:48px;margin-bottom:14px;border:1px solid #3c718a;border-radius:16px;background:linear-gradient(145deg,#173e54,#112d42);color:#75d5fb}
    .welcome-mark svg{width:23px;height:23px}
    .welcome strong{color:#f1f8fc;font-size:15px;font-weight:700}
    .welcome p{max-width:250px;margin:7px 0 0;color:#9eb8c9;font-size:12px;line-height:1.55}
    .bubble{position:relative;max-width:82%;align-self:flex-start;padding:11px 13px 9px;border:1px solid #294b61;border-radius:16px 16px 16px 5px;background:linear-gradient(145deg,#17374b,#142f42);box-shadow:0 4px 12px #00000012;color:#e7f2f8;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;animation:message-in .16s ease-out}
    .bubble.staff{align-self:flex-end;border-color:#1886c0;border-radius:16px 16px 5px 16px;background:linear-gradient(145deg,#1689ce,#0875b7);color:#fff}
    @keyframes message-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
    .bubble time{display:block;margin-top:5px;color:#a8c4d5;font-size:10px;line-height:1.2}
    .bubble.staff time{color:#d5eeff}
    .status{min-height:0;padding:0 15px;color:#ffc7b9;font-size:11px}
    .status:not(:empty){padding-top:7px}
    .composer{display:flex;align-items:flex-end;gap:9px;padding:11px 12px 12px;border-top:1px solid #203e51;background:linear-gradient(180deg,#0d2231,#0b1d2a)}
    .composer textarea{display:block;min-width:0;min-height:48px;max-height:104px;flex:1;resize:none;padding:13px 14px;border:1px solid #355c73;border-radius:15px;background:#102b3e;color:#f3f8fc;font:inherit;font-size:13px;line-height:1.4;outline:none;transition:border-color .16s ease,box-shadow .16s ease,background .16s ease}
    .composer textarea::placeholder{color:#91aabd;opacity:1}
    .composer textarea:focus{border-color:#42b8e8;background:#112f44;box-shadow:0 0 0 3px #27a8dc20}
    .composer button{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;border:1px solid #40b2e8;border-radius:15px;background:linear-gradient(145deg,#1698dd,#0878bd);color:#fff;cursor:pointer;box-shadow:0 5px 14px #001e3344;transition:transform .16s ease,filter .16s ease}
    .composer button:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.08)}
    .composer button:disabled{opacity:.55;cursor:wait}
    .composer button svg{width:20px;height:20px}
    @media(max-width:480px){:host{right:12px!important;bottom:12px!important}.panel{right:-2px;width:calc(100vw - 24px);height:min(580px,calc(100vh - 96px));border-radius:19px}}
    @media(prefers-reduced-motion:reduce){.panel.open,.bubble{animation:none}.launcher,.close,.composer textarea,.composer button{transition:none}}
  </style>
  <button class="launcher" type="button" aria-label="Abrir chat de soporte" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.2 11.2a7.9 7.9 0 0 1-.8 3.6 8.1 8.1 0 0 1-7.3 4.5 8 8 0 0 1-3.6-.8L3 20l1.5-5.2a8 8 0 0 1-.8-3.6 8.1 8.1 0 0 1 4.5-7.3 8 8 0 0 1 3.6-.8h.5a8.1 8.1 0 0 1 7.8 7.6z"/><path d="M8.8 11h.01M12 11h.01M15.2 11h.01" stroke-width="2.5"/></svg></button>
  <section class="panel" aria-label="Chat de soporte">
    <header class="head">
      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.7 20.8 12 12 21.3 3.2 12 12 2.7Z"/><path d="M8.5 12h7M12 8.5v7"/><circle cx="12" cy="12" r="2.1"/></svg></span>
      <div class="identity"><strong>Soporte GANA777</strong><small>Atención al cliente</small><span class="visitor"><span class="visitor-label">Visitante</span><span class="nickname">Conectando…</span></span></div>
      <button class="close" type="button" aria-label="Cerrar chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </header>
    <div class="log" role="log" aria-live="polite"></div>
    <div class="status" role="status"></div>
    <form class="composer"><textarea maxlength="2000" placeholder="Escribí tu mensaje…" aria-label="Escribí tu mensaje" required></textarea><button type="submit" aria-label="Enviar mensaje"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.5 2.5-7 19-4.1-8-8-4.1 19.1-6.9Z"/><path d="M21.5 2.5 10.4 13.6"/></svg></button></form>
  </section>`;
  document.body.appendChild(host);

  var launcher = root.querySelector('.launcher');
  var panel = root.querySelector('.panel');
  var log = root.querySelector('.log');
  var form = root.querySelector('.composer');
  var input = root.querySelector('textarea');
  var send = root.querySelector('.composer button');
  var status = root.querySelector('.status');
  var nickname = root.querySelector('.nickname');
  var close = root.querySelector('.close');

  function draw() {
    var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.textContent = '';
    if (!messages.length) {
      var welcome = document.createElement('div'); welcome.className = 'welcome';
      welcome.innerHTML = '<span class="welcome-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 11.2a7.9 7.9 0 0 1-.8 3.6 8.1 8.1 0 0 1-7.3 4.5 8 8 0 0 1-3.6-.8L3 20l1.5-5.2a8 8 0 0 1-.8-3.6 8.1 8.1 0 0 1 4.5-7.3 8 8 0 0 1 3.6-.8h.5a8.1 8.1 0 0 1 7.8 7.6z"/></svg></span><strong>¿En qué podemos ayudarte?</strong><p>Escribinos tu consulta y el equipo de soporte te responderá por acá.</p>';
      log.appendChild(welcome);
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
  close.addEventListener('click', function () { setOpen(false); });
  form.addEventListener('submit', async function (event) {
    event.preventDefault(); var body = input.value.trim(); if (!body || busy) return;
    busy = true; send.disabled = true; status.textContent = '';
    try { await ensureSession(); var data = await call('send', { body: body }); input.value = ''; merge(data.messages); }
    catch (error) { status.textContent = error.message || 'No pudimos enviar el mensaje.'; }
    finally { busy = false; send.disabled = false; input.focus(); }
  });
})();
