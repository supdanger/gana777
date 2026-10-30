import { createClient } from 'npm:@supabase/supabase-js@2';
import { requiredEnv } from '../_shared/cloudinary.ts';
import { HttpError } from '../_shared/http.ts';
import { parseMessage, parseUuid } from '../_shared/validation.ts';

const allowedOrigins = new Set(['https://gana777bet.com', 'https://www.gana777bet.com', 'https://gana777bet.online', 'https://gana777.vercel.app']);
const nicknameParts = ['Poker', 'Ruleta', 'Fichas', 'Jackpot', 'Crupier', 'Tragamonedas', 'Blackjack', 'Casino'];
const tokenPattern = /^[A-Za-z0-9_-]{40,64}$/;
type Thread = { id: string; nickname: string; completed_at: string | null; origin: string; linked_user_id: string | null; linked_at: string | null };
const service = () => createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function headers(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? 'null',
    'Access-Control-Allow-Headers': 'apikey, authorization, x-client-info, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function createThread(origin: string) {
  const db = service();
  for (let attempt = 0; attempt < 12; attempt++) {
    const token = newToken();
    const nickname = `${nicknameParts[crypto.getRandomValues(new Uint32Array(1))[0] % nicknameParts.length]}${1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000)}`;
    const { data, error } = await db.from('external_chat_threads').insert({ nickname, token_hash: await tokenHash(token), origin })
      .select('id,nickname,completed_at,origin,linked_user_id,linked_at').single();
    if (!error && data) return { token, thread: data };
    if (error?.code !== '23505') throw new HttpError(503, 'No pudimos iniciar el chat. Intentá nuevamente.');
  }
  throw new HttpError(503, 'No pudimos asignar un apodo al chat. Intentá nuevamente.');
}

async function findThread(token: unknown) {
  if (typeof token !== 'string' || !tokenPattern.test(token)) throw new HttpError(401, 'La sesión del chat venció.');
  const { data, error } = await service().from('external_chat_threads')
    .select('id,nickname,completed_at,origin,linked_user_id,linked_at').eq('token_hash', await tokenHash(token)).maybeSingle();
  if (error) throw new HttpError(503, 'No pudimos consultar el chat.');
  if (!data) throw new HttpError(401, 'La sesión del chat venció.');
  return data;
}

async function readMessages(thread: Thread) {
  const { data, error } = await service().from('external_chat_messages')
    .select('id,sender_type,body,attachment_path,created_at').eq('thread_id', thread.id)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100);
  if (error) throw new HttpError(503, 'No pudimos cargar los mensajes.');
  if (!thread.linked_user_id || !thread.linked_at) return (data ?? []).reverse();
  const { data: appMessages, error: appError } = await service().from('messages')
    .select('id,sender_id,body,attachment_path,created_at')
    .eq('user_id', thread.linked_user_id).eq('external_visible', true)
    .gte('created_at', thread.linked_at)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100);
  if (appError) throw new HttpError(503, 'No pudimos cargar los mensajes vinculados.');
  return [...(data ?? []), ...(appMessages ?? []).map(message => ({
    id: message.id,
    sender_type: message.sender_id === thread.linked_user_id ? 'visitor' : 'staff',
    body: message.body, attachment_path: message.attachment_path, created_at: message.created_at,
  }))].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).slice(-100);
}

async function bubbleSettings(db: ReturnType<typeof service>) {
  const { data, error } = await db.from('app_settings').select('external_chat_enabled,external_chat_option_enabled,external_charge_option_enabled').eq('id', true).single();
  if (error || !data) throw new HttpError(503, 'No pudimos consultar la disponibilidad del chat.');
  return { enabled: data.external_chat_enabled === true && (data.external_chat_option_enabled || data.external_charge_option_enabled), chat_enabled: data.external_chat_option_enabled === true, charge_enabled: data.external_charge_option_enabled === true };
}

Deno.serve(async request => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') {
    if (!origin || !allowedOrigins.has(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: headers(origin) });
  }
  if (request.method !== 'POST') return new Response('Método no permitido.', { status: 405 });
  if (!origin || !allowedOrigins.has(origin)) return jsonResponse({ error: 'Origen no autorizado.' }, 403, origin ?? 'null');

  try {
    const raw = await request.text();
    if (raw.length > 3_000_000) throw new HttpError(413, 'El mensaje o la imagen son demasiado grandes.');
    const input = JSON.parse(raw);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Solicitud inválida.');
    const action = input?.action;
    const db = service();

    const settings = await bubbleSettings(db);
    if (action === 'status') return jsonResponse(settings, 200, origin);
    if (!settings.enabled || !settings.chat_enabled) throw new HttpError(503, 'El chat de soporte está pausado en este momento.');

    if (action === 'start') {
      let thread: Thread | null = null;
      let token = typeof input.token === 'string' ? input.token : null;
      if (token && tokenPattern.test(token)) {
        const { data } = await db.from('external_chat_threads').select('id,nickname,completed_at,origin,linked_user_id,linked_at').eq('token_hash', await tokenHash(token)).maybeSingle();
        if (data?.origin === origin) thread = data;
      }
      if (!thread) {
        const created = await createThread(origin);
        token = created.token;
        thread = created.thread;
      }
      await db.from('external_chat_threads').update({ last_seen_at: new Date().toISOString() }).eq('id', thread.id);
      return jsonResponse({ token, nickname: thread.nickname, link_version: thread.linked_at, messages: await readMessages(thread) }, 200, origin);
    }

    const thread = await findThread(input?.token);
    if (thread.origin !== origin) throw new HttpError(403, 'Origen no autorizado para esta conversación.');
    await db.from('external_chat_threads').update({ last_seen_at: new Date().toISOString() }).eq('id', thread.id);
    if (action === 'send') {
      let attachmentPath: string | null = null;
      if (input.attachment !== undefined && input.attachment !== null) {
        const attachment = input.attachment;
        if (!attachment || typeof attachment !== 'object' || typeof attachment.data !== 'string'
          || !['image/webp', 'image/jpeg', 'image/png'].includes(attachment.mime_type)
          || attachment.data.length > 2_800_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(attachment.data)) {
          throw new HttpError(400, 'La imagen no es válida o supera el tamaño permitido.');
        }
        let binary: string;
        try { binary = atob(attachment.data); } catch { throw new HttpError(400, 'La imagen no es válida.'); }
        if (!binary.length || binary.length > 2_097_152) throw new HttpError(413, 'La imagen no puede superar 2 MB.');
        const bytes = Uint8Array.from(binary, value => value.charCodeAt(0));
        const isWebp = attachment.mime_type === 'image/webp' && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
          && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
        const isPng = attachment.mime_type === 'image/png' && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
        const isJpeg = attachment.mime_type === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        if (!isWebp && !isPng && !isJpeg) throw new HttpError(400, 'El archivo no parece ser una imagen válida.');
        const extension = isWebp ? 'webp' : isPng ? 'png' : 'jpg';
        attachmentPath = `${thread.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await db.storage.from('external-chat-files').upload(attachmentPath, bytes, {
          contentType: attachment.mime_type, cacheControl: '3600', upsert: false,
        });
        if (uploadError) throw new HttpError(503, 'No pudimos guardar la imagen. Intentá nuevamente.');
      }
      const body = typeof input.body === 'string' && input.body.trim() ? parseMessage(input.body) : attachmentPath ? 'Imagen adjunta' : parseMessage(input.body);
      const { error } = await db.from('external_chat_messages').insert({ thread_id: thread.id, sender_type: 'visitor', sender_id: null, body, attachment_path: attachmentPath });
      if (error) {
        if (attachmentPath) await db.storage.from('external-chat-files').remove([attachmentPath]);
        throw new HttpError(error.code === 'P0001' ? 429 : 503, error.code === 'P0001' ? error.message : 'No pudimos enviar el mensaje. Intentá nuevamente.');
      }
      await db.from('external_chat_threads').update({ completed_at: null, completed_by: null, last_seen_at: new Date().toISOString() }).eq('id', thread.id);
      return jsonResponse({ nickname: thread.nickname, link_version: thread.linked_at, messages: await readMessages(thread) }, 200, origin);
    }
    if (action === 'read') return jsonResponse({ nickname: thread.nickname, link_version: thread.linked_at, messages: await readMessages(thread) }, 200, origin);
    if (action === 'attachment-url') {
      const messageId = parseUuid(input?.message_id);
      const { data: message, error: messageError } = await db.from('external_chat_messages')
        .select('attachment_path').eq('id', messageId).eq('thread_id', thread.id).maybeSingle();
      if (messageError) throw new HttpError(503, 'No pudimos consultar la imagen.');
      let imagePath = message?.attachment_path ?? null;
      let imageBucket = 'external-chat-files';
      if (!imagePath && thread.linked_user_id && thread.linked_at) {
        const { data: linkedMessage, error: linkedError } = await db.from('messages')
          .select('attachment_path').eq('id', messageId).eq('user_id', thread.linked_user_id)
          .eq('external_visible', true).gte('created_at', thread.linked_at).maybeSingle();
        if (linkedError) throw new HttpError(503, 'No pudimos consultar la imagen.');
        imagePath = linkedMessage?.attachment_path ?? null;
        imageBucket = 'chat-images';
      }
      if (!imagePath) throw new HttpError(404, 'No encontramos esa imagen.');
      const { data: signed, error: signedError } = await db.storage.from(imageBucket).createSignedUrl(imagePath, 3600);
      if (signedError || !signed?.signedUrl) throw new HttpError(503, 'No pudimos cargar la imagen.');
      return jsonResponse({ url: signed.signedUrl }, 200, origin);
    }
    throw new HttpError(400, 'Operación de chat no válida.');
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, origin);
    if (error instanceof Error && error.name === 'InputError') return jsonResponse({ error: error.message }, 400, origin);
    console.error('external-chat failed', { type: error instanceof Error ? error.name : 'unknown' });
    return jsonResponse({ error: 'No pudimos procesar el chat. Intentá nuevamente.' }, 500, origin);
  }
});
