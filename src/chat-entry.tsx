import { type FormEvent } from 'react';
import { InputError, parseMessage } from '../supabase/functions/_shared/validation';
import { entryLinkBody, entryLinkUrl, isEntryBody } from './entry-link';
import { supabase } from './lib';

export function supabaseVerifyHost(): string {
  const raw = import.meta.env.VITE_SUPABASE_URL;
  if (typeof raw !== 'string' || !raw) return '';
  try { return new URL(raw).hostname.toLowerCase(); } catch { return ''; }
}

async function functionError(error: unknown, data: unknown): Promise<Error> {
  const fallback = 'No pudimos mandar el botón Entrar. Intentá nuevamente.';
  const readable = (value: string) => value && !/https?:|token/i.test(value) ? value : '';
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    const message = readable(data.error);
    if (message) return new InputError(message);
  }
  if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    if (error.context.status === 403) return new InputError('Para mandar Entrar necesitás permiso de Usuarios.');
    if (error.context.status === 404) return new InputError('La función de ingresos todavía no está disponible.');
    try {
      const body: unknown = await error.context.clone().json();
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
        const message = readable(body.error);
        if (message) return new InputError(message);
      }
    } catch { /* Supabase puede responder sin JSON. */ }
  }
  return new InputError(fallback);
}

export async function createEntryMessage(username: string): Promise<string> {
  const name = username.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(name)) throw new InputError('Ingresá el usuario exacto del jugador.');
  if (!supabase) throw new InputError('La vista previa no crea enlaces.');
  const { playerLoginRedirect } = await import('./login-link-admin');
  const result = await supabase.functions.invoke('manage-players', {
    body: { action: 'login-link-again', username: name, redirect_to: playerLoginRedirect() },
  });
  const link = result.data && typeof result.data === 'object' && 'action_link' in result.data && typeof result.data.action_link === 'string'
    ? result.data.action_link : '';
  if (result.error || !link) throw await functionError(result.error, result.data);
  const body = parseMessage(entryLinkBody(link));
  if (!entryLinkUrl(body, supabaseVerifyHost())) throw new InputError('No se pudo crear el enlace.');
  return body;
}

export function ChatMessageText({ body, interactive }: { body: string; interactive: boolean }) {
  if (!isEntryBody(body)) return body;
  const url = interactive ? entryLinkUrl(body, supabaseVerifyHost()) : null;
  if (!url) return <span className="chat-entry-link is-static">Entrar</span>;
  return <a className="chat-entry-link" href={url} target="_blank" rel="noopener noreferrer">Entrar</a>;
}

export function EntryLinkBar({ id, username, onUsername, disabled, onSend }: {
  id: string; username: string; onUsername: (value: string) => void; disabled: boolean; onSend: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSend();
  }
  return <form className="admin-chat-entry" onSubmit={submit}>
    <label className="sr-only" htmlFor={id}>Usuario del botón Entrar</label>
    <input id={id} value={username} onChange={event => onUsername(event.target.value)} placeholder="Usuario para Entrar" autoCapitalize="none" spellCheck={false} maxLength={32} disabled={disabled} />
    <button type="submit" disabled={disabled || !username.trim()}>Mandar Entrar</button>
  </form>;
}
