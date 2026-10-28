import { useEffect, useState } from 'react';
import { Check, Copy, MessageCircle, Power } from 'lucide-react';
import { supabase } from './lib';

export function AdminExternalChatSettings({ demo }: { demo: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState(false);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
  const integrationCode = supabaseUrl && publicKey
    ? `<script async src="https://gana777bet.online/external-chat-widget.js" data-endpoint="${supabaseUrl}/functions/v1/external-chat" data-key="${publicKey}"></script>`
    : '';

  useEffect(() => {
    if (!supabase || demo) { setEnabled(null); return; }
    let alive = true;
    void supabase.from('app_settings').select('external_chat_enabled').eq('id', true).single().then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setFeedback('No pudimos cargar el estado del chat.'); return; }
      setEnabled(data.external_chat_enabled);
    });
    return () => { alive = false; };
  }, [demo]);

  async function toggle() {
    if (!supabase || enabled === null || saving || demo) return;
    setSaving(true); setFeedback('');
    const { data, error } = await supabase.rpc('set_external_chat_enabled', { p_enabled: !enabled });
    setSaving(false);
    if (error || typeof data !== 'boolean') { setFeedback('No pudimos cambiar el estado del chat. Intentá nuevamente.'); return; }
    setEnabled(data);
    setFeedback(data ? 'El chat ya está activo en la plataforma.' : 'El chat quedó pausado y se ocultará en la plataforma.');
  }

  async function copyCode() {
    if (!integrationCode) return;
    try { await navigator.clipboard.writeText(integrationCode); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setFeedback('No pudimos copiar el código. Seleccionalo y copialo manualmente.'); }
  }

  return <section className="external-chat-settings">
    <header className="external-chat-settings-heading"><h1>Admin</h1><p>Configurá la visibilidad y el código de integración del chat en la plataforma.</p></header>
    <article className={`card external-chat-control${enabled ? ' is-active' : ''}`}>
      <span className="external-chat-control-icon"><MessageCircle size={20} /></span>
      <div className="external-chat-control-copy"><strong>Burbuja en la plataforma</strong><p>{enabled === null ? 'Estado no disponible' : enabled ? 'Activa y visible para los visitantes.' : 'Pausada y oculta para los visitantes.'}</p></div>
      <button type="button" className={`external-chat-toggle${enabled ? ' is-active' : ''}`} role="switch" aria-checked={enabled === true} disabled={demo || enabled === null || saving} onClick={() => void toggle()}><span className="external-chat-toggle-knob" /><span>{saving ? 'Guardando…' : enabled ? 'Activa' : 'Pausada'}</span><Power size={15} /></button>
      {feedback && <small className="external-chat-control-feedback" role="status">{feedback}</small>}
    </article>
    <article className="card external-chat-install"><div><strong>Código para integrar la burbuja</strong><p>Copialo y pasáselo al equipo de la plataforma para que lo agregue al HTML de gana777bet.com.</p></div><textarea aria-label="Código de instalación del chat" readOnly value={integrationCode || 'Configurá la URL y la clave pública de Supabase para generar el código.'} rows={3} /><button type="button" className="external-chat-copy" disabled={!integrationCode} onClick={() => void copyCode()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copiado' : 'Copiar código'}</button><small>La clave incluida es pública para el navegador; no contiene credenciales administrativas.</small></article>
  </section>;
}
