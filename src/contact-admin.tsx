import { useEffect, useState, type FormEvent } from 'react';
import { MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { InputError } from '../supabase/functions/_shared/validation';
import { supabase } from './lib';
import { safeHttpsLink } from './security';

type Principal = { slot: number; phone: string; active: boolean; created_at: string };
type ContactSettings = { show_whatsapp: boolean; show_telegram: boolean; show_instagram: boolean; telegram_url: string | null; instagram_url: string | null };
const defaultSettings: ContactSettings = { show_whatsapp: true, show_telegram: true, show_instagram: true, telegram_url: null, instagram_url: null };

function normalizedPhone(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string' || !/^[+0-9 ().-]+$/.test(value.trim())) throw new InputError('Ingresá un número de WhatsApp válido.');
  const phone = value.replace(/\D/g, '');
  if (!/^[1-9][0-9]{7,14}$/.test(phone)) throw new InputError('Usá código de país y entre 8 y 15 números.');
  return phone;
}
function optionalContactLink(value: FormDataEntryValue | null, hosts: string[], channel: string): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  const link = safeHttpsLink(raw, hosts);
  if (!link) throw new InputError(`Ingresá un enlace HTTPS válido de ${channel}.`);
  return link;
}

export function ContactAdmin({ demo, busy, action }: { demo: boolean; busy: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(!demo && !!supabase);
  const [loadError, setLoadError] = useState('');
  const [editSlot, setEditSlot] = useState<number | null>(null);

  async function refresh() {
    if (demo || !supabase) { setLoading(false); return; }
    const [numbers, config] = await Promise.all([
      supabase.from('whatsapp_principals').select('slot,phone,active,created_at').order('slot'),
      supabase.from('app_settings').select('show_whatsapp,show_telegram,show_instagram,telegram_url,instagram_url').eq('id', true).single(),
    ]);
    setLoading(false);
    const failure = numbers.error ?? config.error;
    if (failure) { setLoadError('No pudimos cargar Contactos. Aplicá la migración 017.'); return; }
    setLoadError(''); setPrincipals((numbers.data ?? []) as Principal[]); setSettings(config.data as ContactSettings);
  }
  useEffect(() => { void refresh(); }, [demo]);

  async function saveVisibility(next: Partial<ContactSettings>) {
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no guarda contactos.');
      const value = { ...settings, ...next };
      const { error } = await supabase.from('app_settings').update(value).eq('id', true);
      if (error) throw error;
      setSettings(value);
    });
  }
  async function saveLinks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await saveVisibility({
      telegram_url: optionalContactLink(form.get('telegram_url'), ['t.me'], 'Telegram'),
      instagram_url: optionalContactLink(form.get('instagram_url'), ['instagram.com', 'www.instagram.com'], 'Instagram'),
    });
  }
  async function createPrincipal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no crea principales.');
      const slot = Number(form.get('slot'));
      if (!Number.isInteger(slot) || slot < 1 || slot > 50) throw new InputError('El principal debe estar entre 1 y 50.');
      const { error } = await supabase.from('whatsapp_principals').insert({ slot, phone: normalizedPhone(form.get('phone')) });
      if (error) {
        if (/duplicate|unique/i.test(error.message)) throw new InputError('Ese principal o número de WhatsApp ya está registrado.');
        throw error;
      }
      element.reset(); await refresh();
    });
  }
  async function updatePrincipal(event: FormEvent<HTMLFormElement>, principal: Principal) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no modifica principales.');
      const { error } = await supabase.from('whatsapp_principals').update({ phone: normalizedPhone(form.get('phone')), updated_at: new Date().toISOString() }).eq('slot', principal.slot);
      if (error) {
        if (/duplicate|unique/i.test(error.message)) throw new InputError('Ese número ya está registrado en otro principal.');
        throw error;
      }
      setEditSlot(null); await refresh();
    });
  }
  async function togglePrincipal(principal: Principal) {
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no modifica principales.');
      const { error } = await supabase.from('whatsapp_principals').update({ active: !principal.active, updated_at: new Date().toISOString() }).eq('slot', principal.slot);
      if (error) throw error;
      setPrincipals(items => items.map(item => item.slot === principal.slot ? { ...item, active: !item.active } : item));
    });
  }
  async function removePrincipal(principal: Principal) {
    if (!window.confirm(`¿Eliminar Principal ${principal.slot}? Solo se podrá eliminar si no tiene jugadores asignados.`)) return;
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no elimina principales.');
      const { error } = await supabase.from('whatsapp_principals').delete().eq('slot', principal.slot);
      if (error) {
        if (/foreign key|violates/i.test(error.message)) throw new InputError('No podés eliminarlo porque tiene jugadores asignados. Podés desactivarlo.');
        throw error;
      }
      setPrincipals(items => items.filter(item => item.slot !== principal.slot));
    });
  }

  return <section className="contact-admin" aria-labelledby="contacts-title">
    <div className="account-heading"><div><h1 id="contacts-title">Contactos</h1><p>Administrá los canales visibles y hasta 50 WhatsApp principales.</p></div><strong>{principals.length}/50</strong></div>
    <section className="contact-settings-card">
      <h2>Canales visibles</h2><div className="contact-visibility-grid">{([['show_whatsapp','WhatsApp'],['show_telegram','Telegram'],['show_instagram','Instagram']] as const).map(([key,label]) => <button type="button" role="switch" aria-checked={settings[key]} className={settings[key] ? 'enabled' : ''} key={key} onClick={() => void saveVisibility({ [key]: !settings[key] })}><span />{label}</button>)}</div>
      <form key={`${settings.telegram_url ?? ''}|${settings.instagram_url ?? ''}`} className="contact-link-form" onSubmit={saveLinks}><label>Telegram<input name="telegram_url" type="url" defaultValue={settings.telegram_url ?? ''} placeholder="https://t.me/usuario" /></label><label>Instagram<input name="instagram_url" type="url" defaultValue={settings.instagram_url ?? ''} placeholder="https://instagram.com/usuario" /></label><button disabled={busy}>Guardar enlaces</button></form>
    </section>
    <form className="principal-create" onSubmit={createPrincipal}><div className="player-form-title"><Plus /><div><strong>Agregar principal</strong><small>Guardá el número con su código de país.</small></div></div><div><label>Número de principal<input name="slot" type="number" min="1" max="50" placeholder="17" required /></label><label>WhatsApp<input name="phone" type="tel" maxLength={30} placeholder="+595981123456" required /></label></div><button disabled={busy || principals.length >= 50}>Agregar principal</button></form>
    {loading ? <p className="empty">Cargando contactos…</p> : loadError ? <p className="empty">{loadError}</p> : !principals.length ? <p className="empty">Todavía no cargaste ningún principal.</p> : <div className="principal-list">{principals.map(principal => <article className={`principal-card${principal.active ? '' : ' inactive'}`} key={principal.slot}><span className="principal-icon"><MessageCircle /></span><div><strong>Principal {principal.slot}</strong><small>+{principal.phone}</small></div><button type="button" role="switch" aria-checked={principal.active} className={principal.active ? 'enabled' : ''} onClick={() => void togglePrincipal(principal)}><span />{principal.active ? 'Activo' : 'Pausado'}</button>{editSlot === principal.slot ? <form onSubmit={event => void updatePrincipal(event, principal)}><input name="phone" type="tel" maxLength={30} defaultValue={`+${principal.phone}`} required /><button disabled={busy}>Guardar</button><button type="button" onClick={() => setEditSlot(null)}>Cancelar</button></form> : <div className="principal-actions"><button type="button" onClick={() => setEditSlot(principal.slot)}><Pencil />Editar</button><button type="button" onClick={() => void removePrincipal(principal)}><Trash2 />Eliminar</button></div>}</article>)}</div>}
  </section>;
}
