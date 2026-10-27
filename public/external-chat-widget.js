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
    :host{all:initial;color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#f8f3ff}
    *{box-sizing:border-box}
    .launcher{position:absolute;right:0;bottom:0;display:grid;place-items:center;width:62px;height:62px;border:1px solid #dc8dff;border-radius:50%;background:linear-gradient(145deg,#b43df0,#7412bd);color:#fff;box-shadow:0 10px 28px #19072899,0 0 0 5px #a52eea20;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}
    .launcher:hover{transform:translateY(-2px);box-shadow:0 14px 34px #190728bb,0 0 0 7px #a52eea2c}
    .launcher:focus-visible,.close:focus-visible,.composer button:focus-visible{outline:2px solid #edc5ff;outline-offset:3px}
    .launcher svg{width:27px;height:27px}
    .panel{position:absolute;right:0;bottom:78px;display:none;flex-direction:column;width:min(390px,calc(100vw - 28px));height:min(560px,calc(100vh - 108px));overflow:hidden;border:1px solid #572b70;border-radius:21px;background:#050407;box-shadow:0 22px 70px #000b,0 0 24px #8d27bb18}
    .panel.open{display:flex;animation:chat-in .2s cubic-bezier(.2,.8,.2,1)}
    @keyframes chat-in{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
    .head{position:relative;display:flex;align-items:center;gap:12px;min-height:82px;padding:15px 16px;background:linear-gradient(125deg,#21102d,#160d20 66%,#100a16);border-bottom:1px solid #392046}
    .support-avatar{display:block;flex:0 0 50px;width:50px;height:50px;border:1px solid #a942d2;border-radius:50%;background:#170e20;object-fit:cover;box-shadow:0 0 0 4px #a52eea18,0 5px 14px #09040e88}
    .identity{min-width:0;flex:1;padding-right:30px}
    .identity strong{display:block;overflow:hidden;color:#fff;font-size:15px;font-weight:750;letter-spacing:.01em;text-overflow:ellipsis;white-space:nowrap}
    .identity small{display:block;margin-top:4px;color:#c4afd0;font-size:11px;letter-spacing:.02em}
    .close{position:absolute;top:14px;right:13px;display:grid;place-items:center;width:34px;height:34px;border:1px solid transparent;border-radius:10px;background:transparent;color:#c8b3d2;cursor:pointer;transition:background .16s ease,color .16s ease,border-color .16s ease}
    .close:hover{border-color:#563765;background:#281732;color:#fff}
    .close svg{width:18px;height:18px}
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
    .composer .attach{flex:0 0 42px;width:42px;height:48px;border-color:#57336a;background:#1a1020;color:#e6b8fc}
    .composer .attach svg{width:20px;height:20px}
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
    @media(max-width:480px){:host{right:12px!important;bottom:12px!important}.panel{right:-2px;width:calc(100vw - 24px);height:min(580px,calc(100vh - 96px));border-radius:19px}}
    @media(prefers-reduced-motion:reduce){.panel.open,.bubble{animation:none}.launcher,.close,.composer textarea,.composer button{transition:none}}
  </style>
  <button class="launcher" type="button" aria-label="Abrir chat de soporte" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.2 11.2a7.9 7.9 0 0 1-.8 3.6 8.1 8.1 0 0 1-7.3 4.5 8 8 0 0 1-3.6-.8L3 20l1.5-5.2a8 8 0 0 1-.8-3.6 8.1 8.1 0 0 1 4.5-7.3 8 8 0 0 1 3.6-.8h.5a8.1 8.1 0 0 1 7.8 7.6z"/><path d="M8.8 11h.01M12 11h.01M15.2 11h.01" stroke-width="2.5"/></svg></button>
  <section class="panel" aria-label="Chat de soporte">
    <header class="head">
      <img class="support-avatar" src="https://gana777.vercel.app/support-chat-avatar.webp" alt="Avatar de soporte GANA777" />
      <div class="identity"><strong>Soporte GANA777</strong><small>Atención al cliente</small></div>
      <button class="close" type="button" aria-label="Cerrar chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </header>
    <div class="log" role="log" aria-live="polite"></div>
    <div class="status" role="status"></div>
    <div class="image-preview" aria-live="polite"><img alt="Vista previa de la imagen"/><span></span><button type="button" aria-label="Quitar imagen">Quitar</button></div>
    <form class="composer"><label class="attach" title="Adjuntar imagen"><input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Adjuntar imagen"/><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.4 11.1-8.9 8.8a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg></label><textarea maxlength="2000" placeholder="Escribí tu mensaje…" aria-label="Escribí tu mensaje"></textarea><button class="send" type="submit" aria-label="Enviar mensaje"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.5 2.5-7 19-4.1-8-8-4.1 19.1-6.9Z"/><path d="M21.5 2.5 10.4 13.6"/></svg></button></form>
  </section>`;
  document.body.appendChild(host);

  var launcher = root.querySelector('.launcher');
  var panel = root.querySelector('.panel');
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

  function setOpen(value) {
    isOpen = value; panel.classList.toggle('open', value); launcher.setAttribute('aria-expanded', String(value));
    if (value) { input.focus(); void ensureSession().then(refresh).catch(function (error) { status.textContent = error.message || 'El chat no está disponible en este momento.'; }); }
    else if (timer) { clearInterval(timer); timer = null; }
  }
  launcher.addEventListener('click', function () { setOpen(!isOpen); });
  close.addEventListener('click', function () { setOpen(false); });
  form.addEventListener('submit', async function (event) {
    event.preventDefault(); var body = input.value.trim(); if ((!body && !selectedImage) || busy) return;
    busy = true; send.disabled = true; status.textContent = '';
    try { await ensureSession(); var attachment = selectedImage ? await prepareImage(selectedImage) : null; var data = await call('send', { body: body, attachment: attachment }); input.value = ''; clearImage(); merge(data.messages); }
    catch (error) { status.textContent = error.message || 'No pudimos enviar el mensaje.'; }
    finally { busy = false; send.disabled = false; input.focus(); }
  });
})();
