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
  var positionKey = 'gana777_external_chat_position_v1';
  var position = { right: window.innerWidth <= 480 ? 12 : 18, bottom: window.innerWidth <= 480 ? 72 : 18 };

  try { token = JSON.parse(localStorage.getItem(sessionKey) || 'null')?.token || null; } catch (_) {}
  try {
    var savedPosition = JSON.parse(localStorage.getItem(positionKey) || 'null');
    if (savedPosition && Number.isFinite(savedPosition.right) && Number.isFinite(savedPosition.bottom)) position = savedPosition;
  } catch (_) {}

  var host = document.createElement('div');
  host.id = 'gana777-external-chat';
  host.style.cssText = 'display:none;position:fixed;z-index:2147483000;width:0;height:0;';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{all:initial;color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#f8f3ff}
    *{box-sizing:border-box}
    .launcher{position:absolute;right:0;bottom:0;display:flex;align-items:center;justify-content:center;gap:8px;width:108px;height:50px;padding:0 13px;border:1px solid #dc8dff;border-radius:17px;background:linear-gradient(145deg,#b43df0,#7412bd);color:#fff;box-shadow:0 10px 28px #19072899,0 0 0 5px #a52eea20;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;font:900 12px/1 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.1em;transition:transform .18s ease,box-shadow .18s ease}
    .launcher.dragging{cursor:grabbing;transition:none;transform:scale(1.04);box-shadow:0 14px 34px #190728bb,0 0 0 8px #a52eea35}
    .launcher:hover{transform:translateY(-2px);box-shadow:0 14px 34px #190728bb,0 0 0 7px #a52eea2c}
    .launcher:focus-visible,.close:focus-visible,.composer button:focus-visible{outline:2px solid #edc5ff;outline-offset:3px}
    .launcher svg{flex:0 0 auto;width:22px;height:22px}
    .panel{position:absolute;right:0;bottom:66px;display:none;flex-direction:column;width:min(390px,calc(100vw - 28px));height:min(560px,calc(100vh - 96px));overflow:hidden;border:1px solid #572b70;border-radius:21px;background:#050407;box-shadow:0 22px 70px #000b,0 0 24px #8d27bb18}
    .panel.open{display:flex;animation:chat-in .2s cubic-bezier(.2,.8,.2,1)}
    .panel.menu-mode{height:auto;max-height:calc(100vh - 96px)}
    @keyframes chat-in{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
    .head{position:relative;display:flex;align-items:center;gap:12px;min-height:82px;padding:15px 16px;background:linear-gradient(125deg,#21102d,#160d20 66%,#100a16);border-bottom:1px solid #392046}
    .support-avatar{display:block;flex:0 0 50px;width:50px;height:50px;border:1px solid #a942d2;border-radius:50%;background:#170e20;object-fit:cover;box-shadow:0 0 0 4px #a52eea18,0 5px 14px #09040e88}
    .identity{min-width:0;flex:1;padding-right:30px}
    .identity strong{display:flex;align-items:baseline;gap:5px;overflow:hidden;color:#fff;font-size:13px;font-weight:700;letter-spacing:.01em;white-space:nowrap}
    .identity-brand{display:inline-flex;align-items:baseline;min-width:0;font-size:15px;font-weight:850;letter-spacing:-.045em}
    .identity-brand-777{color:#c344f5;text-shadow:0 0 12px #a328d755}
    .identity-brand-domain{margin-left:1px;color:#d68bfa;font-size:10px;font-weight:800;letter-spacing:-.02em}
    .identity small{display:block;margin-top:4px;color:#c4afd0;font-size:11px;letter-spacing:.02em}
    .close{position:absolute;top:14px;right:13px;display:grid;place-items:center;width:34px;height:34px;border:1px solid transparent;border-radius:10px;background:transparent;color:#c8b3d2;cursor:pointer;transition:background .16s ease,color .16s ease,border-color .16s ease}
    .close:hover{border-color:#563765;background:#281732;color:#fff}
    .close svg{width:18px;height:18px}
    .panel.menu-mode .home-actions{flex:0 0 auto;gap:10px;padding:16px 16px 13px;background:radial-gradient(ellipse at 50% 0,#35134766,transparent 60%),#08060a}
    .home-actions{display:flex;flex:1;flex-direction:column;justify-content:center;gap:13px;padding:24px 18px;background:radial-gradient(ellipse at 50% 0,#35134766,transparent 60%),#08060a}
    .home-actions-title{margin:0 0 1px;color:#ead8f2;font-size:13px;font-weight:800;text-align:center}
    .home-action{display:flex;width:100%;align-items:center;gap:11px;min-height:62px;padding:10px 12px;border:1px solid #543267;border-radius:14px;background:linear-gradient(135deg,#211429,#100c14);color:#f6edfa;text-decoration:none;text-align:left;cursor:pointer;font:inherit;box-shadow:0 6px 16px #0005;transition:border-color .16s ease,background .16s ease,transform .16s ease}
    .home-action:hover{transform:translateY(-1px);border-color:#b24bd0;background:linear-gradient(135deg,#2d1738,#170f1d)}
    .home-action.charge-image{flex:0 0 auto;align-self:center;width:65%;min-height:0;aspect-ratio:1933/813;padding:0;overflow:hidden;border:2px solid #d7a4ef;border-radius:14px;background:#120916;box-shadow:0 0 0 1px #6a3484,0 8px 18px #0007}
    .home-action.charge-image img{display:block;width:100%;height:100%;object-fit:contain}
    .home-action.charge-image:hover{border-color:#f0c8ff;background:#120916;box-shadow:0 0 0 1px #a85ad4,0 8px 18px #0007;filter:brightness(1.08)}
    .home-action.chat-art{flex:0 0 auto;align-self:center;width:65%;min-height:0;gap:0;padding:0;overflow:hidden;border:0;border-radius:16px;background:transparent;box-shadow:none}
    .home-action.chat-art img{display:block;width:100%;height:auto}
    .home-action.chat-art:hover{transform:translateY(-1px);border-color:transparent;background:transparent;box-shadow:none;filter:brightness(1.08)}
    .home-action:focus-visible,.chat-back:focus-visible{outline:2px solid #edc5ff;outline-offset:3px}
    .home-action-mark{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border:1px solid #8542a0;border-radius:12px;background:#291633;color:#dfa9f3;box-shadow:inset 0 1px #ffffff12}
    .home-action-mark svg{width:20px;height:20px}
    .home-action-copy{display:grid;gap:4px;flex:1}
    .home-action-copy strong{font-size:14px;font-weight:850}
    .home-action-copy small{color:#b8a5c3;font-size:11px;line-height:1.35}
    .home-action-arrow{width:17px;height:17px;color:#bd71d6}
    .home-actions-hint{margin:1px 0 0;color:#9d8aa8;font-size:10px;text-align:center}
    .chat-view{display:none;min-height:0;flex:1;flex-direction:column}
    .chat-view.open{display:flex}
    .chat-back{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;min-height:34px;margin:8px 12px 0;padding:5px 9px;border:1px solid #442a50;border-radius:9px;background:#140e19;color:#ddc4e9;font-size:11px;font-weight:750;cursor:pointer}
    .chat-back svg{width:15px;height:15px}
    .log{display:flex;flex:1;flex-direction:column;gap:12px;overflow:auto;padding:18px 15px 16px;background:#050407;scrollbar-color:#563267 transparent;scrollbar-width:thin}
    .welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;min-height:180px;padding:26px 22px;text-align:center}
    .welcome-mark{display:grid;place-items:center;width:48px;height:48px;margin-bottom:14px;border:1px solid #63357a;border-radius:16px;background:linear-gradient(145deg,#281537,#150d1d);color:#d27bfa}
    .welcome-mark svg{width:23px;height:23px}
    .welcome strong{color:#fbf6ff;font-size:15px;font-weight:700}
    .welcome p{max-width:250px;margin:7px 0 0;color:#b0a0ba;font-size:12px;line-height:1.55}
    .bubble{position:relative;max-width:82%;align-self:flex-start;padding:11px 13px 9px;border:1px solid #37243f;border-radius:16px 16px 16px 5px;background:linear-gradient(145deg,#17131b,#100d13);box-shadow:0 4px 12px #0005;color:#f1eaf5;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;animation:message-in .16s ease-out}
    .bubble.staff{align-self:flex-start;border-color:#4a3157;border-radius:16px 16px 16px 5px;background:linear-gradient(145deg,#1c1721,#120f16);color:#f4edf8}
    .bubble.visitor{align-self:flex-end;border-color:#9f37d2;border-radius:16px 16px 5px 16px;background:linear-gradient(145deg,#7920a5,#4c126f);color:#fff;box-shadow:0 5px 16px #4e126c40}
    .chat-image{display:block;max-width:100%;max-height:240px;margin-top:3px;border:1px solid #9f37d2;border-radius:10px;object-fit:contain;cursor:zoom-in}
    @keyframes message-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
    .bubble time{display:block;margin-top:5px;color:#b7aaba;font-size:10px;line-height:1.2}
    .bubble.staff time{color:#b9aabe}
    .bubble.visitor time{color:#efcef9}
    .status{min-height:0;padding:0 15px;color:#f0b5ff;font-size:11px}
    .status:not(:empty){padding-top:7px}
    .composer{display:flex;align-items:flex-end;gap:9px;padding:11px 12px 12px;border-top:1px solid #2c1c35;background:linear-gradient(180deg,#0d0a10,#08060a)}
    .composer .attach{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;padding:0;border:1px solid #8041a0;border-radius:14px;background:linear-gradient(145deg,#281533,#170e1e);color:#e6b8fc;cursor:pointer;box-shadow:0 4px 12px #19072744;transition:transform .16s ease,border-color .16s ease,background .16s ease}
    .composer .attach:hover{transform:translateY(-1px);border-color:#cf78f2;background:linear-gradient(145deg,#382047,#21112d)}
    .composer .attach svg{width:21px;height:21px}
    .composer .attach input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;clip-path:inset(50%)}
    .composer .attach:focus-within{outline:2px solid #edc5ff;outline-offset:3px}
    .image-preview{display:none;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid #2c1c35;background:#0d0a10;color:#cdbbd6;font-size:11px}
    .image-preview.visible{display:flex}
    .image-preview img{width:42px;height:42px;border:1px solid #8f35b9;border-radius:8px;object-fit:cover}
    .image-preview span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .image-preview button{border:0;background:none;color:#f2dfff;font:inherit;cursor:pointer}
    .composer textarea{display:block;min-width:0;min-height:48px;max-height:104px;flex:1;resize:none;padding:13px 14px;border:1px solid #4b3158;border-radius:15px;background:#17101d;color:#fbf7ff;font:inherit;font-size:13px;line-height:1.4;outline:none;transition:border-color .16s ease,box-shadow .16s ease,background .16s ease}
    .composer textarea::placeholder{color:#b0a0ba;opacity:1}
    .composer textarea:focus{border-color:#bc4aef;background:#1c1224;box-shadow:0 0 0 3px #aa35df29}
    .composer button{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;border:1px solid #d180f4;border-radius:15px;background:linear-gradient(145deg,#aa32dc,#7413ad);color:#fff;cursor:pointer;box-shadow:0 5px 14px #19072766;transition:transform .16s ease,filter .16s ease}
    .composer button:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.08)}
    .composer button:disabled{opacity:.55;cursor:wait}
    .composer button svg{width:20px;height:20px}
    .panel.align-left{right:auto;left:-108px}
    .panel.align-below{bottom:auto;top:66px}
    @media(max-width:480px){.panel{width:calc(100vw - 24px);height:min(580px,calc(100vh - 156px));height:min(580px,calc(100dvh - 156px));border-radius:19px}.panel.menu-mode{height:auto;max-height:calc(100dvh - 156px);border-radius:17px}}
    @media(prefers-reduced-motion:reduce){.panel.open,.bubble{animation:none}.launcher,.close,.composer textarea,.composer button{transition:none}}
  </style>
  <button class="launcher" type="button" aria-label="Abrir opciones de cargas y chat; arrastrá para mover" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.2 11.2a7.9 7.9 0 0 1-.8 3.6 8.1 8.1 0 0 1-7.3 4.5 8 8 0 0 1-3.6-.8L3 20l1.5-5.2a8 8 0 0 1-.8-3.6 8.1 8.1 0 0 1 4.5-7.3 8 8 0 0 1 3.6-.8h.5a8.1 8.1 0 0 1 7.8 7.6z"/><path d="M8.8 11h.01M12 11h.01M15.2 11h.01" stroke-width="2.5"/></svg><span>CHAT</span></button>
  <section class="panel" aria-label="Chat de soporte">
    <header class="head">
      <img class="support-avatar" src="https://gana777bet.online/support-chat-avatar.webp" alt="Avatar de soporte GANA777" />
      <div class="identity"><strong><span>Soporte</span><span class="identity-brand"><span>Gana</span><span class="identity-brand-777">777</span><span class="identity-brand-domain">bet.com</span></span></strong><small>Atención al cliente</small></div>
      <button class="close" type="button" aria-label="Cerrar chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </header>
    <div class="home-actions" aria-label="Elegí una opción">
      <p class="home-actions-title">¿Qué querés hacer?</p>
      <a class="home-action charge-image" href="https://gana777bet.online/" target="_blank" rel="noopener noreferrer" aria-label="Ir a cargar en gana777bet.online"><img src="https://gana777bet.online/carga-chat-transparent.png" alt="IR A CARGAR" decoding="async" /></a>
      <button class="home-action chat-art chat-option" type="button" aria-label="Abrir el chat de soporte"><img src="https://gana777bet.online/chat-soporte-transparent.png" alt="CHAT SOPORTE" decoding="async" /></button>
      <p class="home-actions-hint">Podés arrastrar el botón CHAT para moverlo de lugar.</p>
    </div>
    <div class="chat-view"><button class="chat-back" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6M9 12h11"/></svg>Volver a opciones</button>
    <div class="log" role="log" aria-live="polite"></div>
    <div class="status" role="status"></div>
    <div class="image-preview" aria-live="polite"><img alt="Vista previa de la imagen"/><span></span><button type="button" aria-label="Quitar imagen">Quitar</button></div>
    <form class="composer"><label class="attach" title="Adjuntar imagen"><input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Adjuntar imagen"/><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.4 11.1-8.9 8.8a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg></label><textarea maxlength="2000" placeholder="Escribí tu mensaje…" aria-label="Escribí tu mensaje"></textarea><button class="send" type="submit" aria-label="Enviar mensaje"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.5 2.5-7 19-4.1-8-8-4.1 19.1-6.9Z"/><path d="M21.5 2.5 10.4 13.6"/></svg></button></form>
    </div>
  </section>`;
  document.body.appendChild(host);

  var launcher = root.querySelector('.launcher');
  var panel = root.querySelector('.panel');
  var homeActions = root.querySelector('.home-actions');
  var chatView = root.querySelector('.chat-view');
  var chatOption = root.querySelector('.chat-option');
  var chatBack = root.querySelector('.chat-back');
  var log = root.querySelector('.log');
  var form = root.querySelector('.composer');
  var input = root.querySelector('textarea');
  var send = root.querySelector('.composer .send');
  var fileInput = root.querySelector('.composer input[type=file]');
  var preview = root.querySelector('.image-preview');
  var previewImage = preview.querySelector('img');
  var previewName = preview.querySelector('span');
  var selectedImage = null;
  var previewUrl = null;
  var status = root.querySelector('.status');
  var close = root.querySelector('.close');
  var drag = null;
  var movedLauncher = false;
  var suppressLauncherClick = false;

  function clampPosition() {
    position.right = Math.min(Math.max(8, position.right), Math.max(8, window.innerWidth - 116));
    position.bottom = Math.min(Math.max(8, position.bottom), Math.max(8, window.innerHeight - 58));
  }
  function applyPosition(save) {
    clampPosition();
    host.style.right = position.right + 'px';
    host.style.bottom = position.bottom + 'px';
    var left = window.innerWidth - position.right - 108;
    var top = window.innerHeight - position.bottom - 50;
    panel.classList.toggle('align-left', left + 54 < window.innerWidth / 2);
    panel.classList.toggle('align-below', top + 25 < window.innerHeight / 2);
    if (save) { try { localStorage.setItem(positionKey, JSON.stringify(position)); } catch (_) {} }
  }
  applyPosition(false);
  window.addEventListener('resize', function () { applyPosition(false); });

  launcher.addEventListener('pointerdown', function (event) {
    if (!event.isPrimary || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, right: position.right, bottom: position.bottom };
    movedLauncher = false;
    try { launcher.setPointerCapture(event.pointerId); } catch (_) {}
  });
  launcher.addEventListener('pointermove', function (event) {
    if (!drag || event.pointerId !== drag.id) return;
    var dx = event.clientX - drag.x;
    var dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) movedLauncher = true;
    if (movedLauncher) {
      launcher.classList.add('dragging');
      position.right = drag.right - dx;
      position.bottom = drag.bottom - dy;
      applyPosition(false);
    }
  });
  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    launcher.classList.remove('dragging');
    if (movedLauncher) {
      suppressLauncherClick = true;
      applyPosition(true);
      window.setTimeout(function () { suppressLauncherClick = false; }, 0);
    }
    drag = null;
  }
  launcher.addEventListener('pointerup', finishDrag);
  launcher.addEventListener('pointercancel', finishDrag);

  function renderMessage(message) {
    var bubble = document.createElement('div'); bubble.className = 'bubble ' + (message.sender_type === 'staff' ? 'staff' : 'visitor');
    if (message.body && !(message.attachment_path && message.body === 'Imagen adjunta')) { var text = document.createElement('span'); text.textContent = message.body; bubble.appendChild(text); }
    if (message.attachment_path) {
      var image = document.createElement('img'); image.className = 'chat-image'; image.alt = 'Imagen adjunta'; image.loading = 'lazy'; image.src = '';
      image.addEventListener('click', function () { if (image.src) window.open(image.src, '_blank', 'noopener'); });
      bubble.appendChild(image);
      call('attachment-url', { message_id: message.id }).then(function (data) { image.src = data.url; }).catch(function () { image.alt = 'No se pudo cargar la imagen adjunta'; });
    }
    var time = document.createElement('time'); time.textContent = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at)); bubble.appendChild(time);
    return bubble;
  }

  function draw() {
    log.textContent = '';
    if (!messages.length) {
      var welcome = document.createElement('div'); welcome.className = 'welcome';
      welcome.innerHTML = '<span class="welcome-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 11.2a7.9 7.9 0 0 1-.8 3.6 8.1 8.1 0 0 1-7.3 4.5 8 8 0 0 1-3.6-.8L3 20l1.5-5.2a8 8 0 0 1-.8-3.6 8.1 8.1 0 0 1 4.5-7.3 8 8 0 0 1 3.6-.8h.5a8.1 8.1 0 0 1 7.8 7.6z"/></svg></span><strong>¿En qué podemos ayudarte?</strong><p>Escribinos tu consulta y el equipo de soporte te responderá por acá.</p>';
      log.appendChild(welcome);
      return;
    }
    messages.forEach(function (message) { log.appendChild(renderMessage(message)); });
    log.scrollTop = log.scrollHeight;
  }

  draw();

  function merge(incoming) {
    if (!Array.isArray(incoming)) return;
    var seen = new Set(messages.map(function (message) { return message.id; }));
    var additions = incoming.filter(function (message) { return !seen.has(message.id); });
    if (!additions.length) return;
    var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    additions.sort(function (a, b) { return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id); });
    messages.push.apply(messages, additions);
    messages.sort(function (a, b) { return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id); });
    var welcome = log.querySelector('.welcome');
    if (welcome) welcome.remove();
    additions.forEach(function (message) { log.appendChild(renderMessage(message)); });
    if (atBottom) log.scrollTop = log.scrollHeight;
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
    try { var data = await call('read'); merge(data.messages); status.textContent = ''; }
    catch (error) { status.textContent = error.message || 'No pudimos actualizar el chat.'; }
    finally { busy = false; }
    if (isOpen && !timer) timer = setInterval(refresh, 5000);
  }

  async function start() {
    var data = await call('start'); token = data.token;
    localStorage.setItem(sessionKey, JSON.stringify({ token: token }));
    merge(data.messages);
  }

  function ensureSession() {
    if (!sessionReady) sessionReady = start().catch(function (error) { sessionReady = null; throw error; });
    return sessionReady;
  }

  function clearImage() {
    selectedImage = null; fileInput.value = ''; preview.classList.remove('visible'); previewImage.removeAttribute('src'); previewName.textContent = '';
    if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null;
  }
  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0]; if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 12 * 1024 * 1024) { status.textContent = 'Elegí una imagen JPG, PNG o WebP de hasta 12 MB.'; clearImage(); return; }
    selectedImage = file; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(file);
    previewImage.src = previewUrl; previewName.textContent = file.name; preview.classList.add('visible'); status.textContent = '';
  });
  preview.querySelector('button').addEventListener('click', clearImage);
  async function prepareImage(file) {
    var bitmap = await createImageBitmap(file); var scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    var canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/webp', .82); });
    if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('La imagen comprimida supera 2 MB. Elegí una imagen más liviana.');
    var dataUrl = await new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = reject; reader.readAsDataURL(blob); });
    return { mime_type: blob.type, data: String(dataUrl).split(',')[1] };
  }

  function showHome() {
    homeActions.style.display = 'flex';
    panel.classList.add('menu-mode');
    chatView.classList.remove('open');
    if (timer) { clearInterval(timer); timer = null; }
  }
  function showChat() {
    homeActions.style.display = 'none';
    panel.classList.remove('menu-mode');
    chatView.classList.add('open');
    input.focus();
    void ensureSession().then(refresh).catch(function (error) { status.textContent = error.message || 'El chat no está disponible en este momento.'; });
  }
  function setOpen(value) {
    isOpen = value; panel.classList.toggle('open', value); launcher.setAttribute('aria-expanded', String(value));
    if (value) showHome();
    else if (timer) { clearInterval(timer); timer = null; }
  }
  launcher.addEventListener('click', function () { if (suppressLauncherClick) { suppressLauncherClick = false; return; } setOpen(!isOpen); });
  close.addEventListener('click', function () { setOpen(false); });
  chatOption.addEventListener('click', showChat);
  chatBack.addEventListener('click', showHome);
  form.addEventListener('submit', async function (event) {
    event.preventDefault(); var body = input.value.trim(); if ((!body && !selectedImage) || busy) return;
    busy = true; send.disabled = true; status.textContent = '';
    try { await ensureSession(); var attachment = selectedImage ? await prepareImage(selectedImage) : null; var data = await call('send', { body: body, attachment: attachment }); input.value = ''; clearImage(); merge(data.messages); }
    catch (error) { status.textContent = error.message || 'No pudimos enviar el mensaje.'; }
    finally { busy = false; send.disabled = false; input.focus(); }
  });

  async function checkAvailability() {
    try {
      var data = await call('status');
      var enabled = data.enabled === true;
      if (!enabled && isOpen) setOpen(false);
      host.style.display = enabled ? 'block' : 'none';
    } catch (_) {
      if (isOpen) setOpen(false);
      host.style.display = 'none';
    }
  }
  void checkAvailability();
  setInterval(checkAvailability, 15000);
})();
