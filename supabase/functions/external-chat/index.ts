import { createClient } from 'npm:@supabase/supabase-js@2';
import { requiredEnv } from '../_shared/cloudinary.ts';
import { HttpError } from '../_shared/http.ts';
import { parseMessage } from '../_shared/validation.ts';

const allowedOrigins = new Set(['https://gana777bet.com', 'https://www.gana777bet.com']);
const nicknameParts = ['Poker', 'Ruleta', 'Fichas', 'Jackpot', 'Crupier', 'Tragamonedas', 'Blackjack', 'Casino'];
const tokenPattern = /^[A-Za-z0-9_-]{40,64}$/;
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
      .select('id,nickname,completed_at,origin').single();
    if (!error && data) return { token, thread: data };
    if (error?.code !== '23505') throw new HttpError(503, 'No pudimos iniciar el chat. Intentá nuevamente.');
  }
  throw new HttpError(503, 'No pudimos asignar un apodo al chat. Intentá nuevamente.');
}

async function findThread(token: unknown) {
  if (typeof token !== 'string' || !tokenPattern.test(token)) throw new HttpError(401, 'La sesión del chat venció.');
  const { data, error } = await service().from('external_chat_threads')
    .select('id,nickname,completed_at,origin').eq('token_hash', await tokenHash(token)).maybeSingle();
  if (error) throw new HttpError(503, 'No pudimos consultar el chat.');
  if (!data) throw new HttpError(401, 'La sesión del chat venció.');
  return data;
}

async function readMessages(threadId: string) {
  const { data, error } = await service().from('external_chat_messages')
    .select('id,sender_type,body,created_at').eq('thread_id', threadId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100);
  if (error) throw new HttpError(503, 'No pudimos cargar los mensajes.');
  return (data ?? []).reverse();
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
    const length = Number(request.headers.get('Content-Length') ?? 0);
    if (length > 5000) throw new HttpError(413, 'El mensaje es demasiado grande.');
    const input = await request.json();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Solicitud inválida.');
    const action = input?.action;
    const db = service();

    if (action === 'start') {
      let thread: { id: string; nickname: string; completed_at: string | null; origin: string } | null = null;
      let token = typeof input.token === 'string' ? input.token : null;
      if (token && tokenPattern.test(token)) {
        const { data } = await db.from('external_chat_threads').select('id,nickname,completed_at,origin').eq('token_hash', await tokenHash(token)).maybeSingle();
        if (data?.origin === origin) thread = data;
      }
      if (!thread) {
        const created = await createThread(origin);
        token = created.token;
        thread = created.thread;
      }
      await db.from('external_chat_threads').update({ last_seen_at: new Date().toISOString() }).eq('id', thread.id);
      return jsonResponse({ token, nickname: thread.nickname, messages: await readMessages(thread.id) }, 200, origin);
    }

    const thread = await findThread(input?.token);
    if (thread.origin !== origin) throw new HttpError(403, 'Origen no autorizado para esta conversación.');
    await db.from('external_chat_threads').update({ last_seen_at: new Date().toISOString() }).eq('id', thread.id);
    if (action === 'send') {
      const body = parseMessage(input?.body);
      const { error } = await db.from('external_chat_messages').insert({ thread_id: thread.id, sender_type: 'visitor', sender_id: null, body });
      if (error) throw new HttpError(error.code === 'P0001' ? 429 : 503, error.code === 'P0001' ? error.message : 'No pudimos enviar el mensaje. Intentá nuevamente.');
      await db.from('external_chat_threads').update({ completed_at: null, completed_by: null, last_seen_at: new Date().toISOString() }).eq('id', thread.id);
      return jsonResponse({ nickname: thread.nickname, messages: await readMessages(thread.id) }, 200, origin);
    }
    if (action === 'read') return jsonResponse({ nickname: thread.nickname, messages: await readMessages(thread.id) }, 200, origin);
    throw new HttpError(400, 'Operación de chat no válida.');
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, origin);
    if (error instanceof Error && error.name === 'InputError') return jsonResponse({ error: error.message }, 400, origin);
    console.error('external-chat failed', { type: error instanceof Error ? error.name : 'unknown' });
    return jsonResponse({ error: 'No pudimos procesar el chat. Intentá nuevamente.' }, 500, origin);
  }
});
