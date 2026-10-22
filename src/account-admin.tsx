import { useEffect, useState, type FormEvent } from 'react';
import { assertFormFields, InputError, parseAlias, parseBank, parseCbu, parseHolder } from '../supabase/functions/_shared/validation';
import { supabase, type Bank } from './lib';
import { groupAccountsByPhone, parsePhoneNumber } from './sac';
import { shifts, shiftLabel, type ShiftKey } from './shifts';
import { bankThemeRegistry, type BankThemeKey } from './bank-themes';
import { BankTransferCard } from './bank-transfer-card';

type Account = Omit<Bank, 'assignment_id'> & { theme_key: BankThemeKey; active: boolean; shift_key: ShiftKey; usage_count: number; phone_number: number | null };
const accountColumns = 'id,bank,holder,cbu,alias,theme_key,active,shift_key,usage_count,phone_number';
const previewNotice = 'La vista previa no guarda las cuentas. Entrá como administrador para realizar cambios.';

function attachThemeAssets(accounts: Record<string, unknown>[], themes: { key: string; background_path: string | null; logo_path: string | null }[]): Account[] {
  const byKey = new Map(themes.map(theme => [theme.key, theme]));
  return accounts.map(row => {
    const theme = byKey.get(String(row.theme_key));
    const phone = row.phone_number == null || row.phone_number === '' ? null : Number(row.phone_number);
    return { ...row, phone_number: Number.isInteger(phone) ? phone : null, theme_background_path: theme?.background_path ?? null, theme_logo_path: theme?.logo_path ?? null, usage_count: Number(row.usage_count) || 0 } as Account;
  });
}

function persistError(error: { code?: string; message?: string }): Error {
  const message = error.message ?? '';
  if (error.code === '23503') return new InputError('Esta cuenta ya tiene cargas asociadas. Pausala en lugar de eliminarla.');
  if (error.code === '42501' || error.code === 'PGRST301' || /row-level security|permission denied|jwt/i.test(message)) return new InputError('No se pudo guardar la cuenta. Entrá nuevamente como administrador.');
  return error instanceof Error ? error : new Error(message || 'No se pudo guardar la cuenta.');
}

export function AccountAdmin({ demo, busy, action }: { demo: boolean; busy: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedShift, setSelectedShift] = useState<ShiftKey>('morning');
  const [loading, setLoading] = useState(!demo && !!supabase);
  const [loadError, setLoadError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = accounts.find(item => item.id === editingId) ?? null;
  const visibleAccounts = accounts.filter(account => account.shift_key === selectedShift);

  useEffect(() => {
    if (demo || !supabase) { setLoading(false); return; }
    const db = supabase;
    let alive = true;
    void Promise.all([
      db.from('bank_accounts').select(accountColumns).order('usage_count').order('bank'),
      db.from('bank_themes').select('key,background_path,logo_path'),
    ]).then(([{ data, error }, { data: themes }]) => {
      if (!alive) return;
      setLoading(false);
      if (error) { setLoadError('No pudimos cargar las cuentas. Aplicá primero la migración de turnos.'); return; }
      setAccounts(attachThemeAssets((data ?? []) as Record<string, unknown>[], (themes ?? []) as { key: string; background_path: string | null; logo_path: string | null }[]));
    });
    return () => { alive = false; };
  }, [demo]);

  function readAccount(form: FormData) {
    assertFormFields(form, ['bank', 'holder', 'cbu', 'alias', 'shift_key', 'theme_key', 'theme_banner', 'included_banner', 'phone_number']);
    const alias = parseAlias(form.get('alias'));
    const shift = form.get('shift_key');
    const theme = form.get('theme_key');
    if (!alias) throw new InputError('Ingresá el alias de la cuenta.');
    if (!shifts.some(item => item.key === shift)) throw new InputError('Elegí un turno válido.');
    if (typeof theme !== 'string' || !(theme in bankThemeRegistry)) throw new InputError('Elegí un diseño bancario válido.');
    return { bank: parseBank(form.get('bank')), holder: parseHolder(form.get('holder')), cbu: parseCbu(form.get('cbu')), alias, shift_key: shift as ShiftKey, theme_key: theme as BankThemeKey, phone_number: parsePhoneNumber(form.get('phone_number')) };
  }

  async function uploadThemeBanner(value: FormDataEntryValue | null, theme: BankThemeKey, useIncluded: boolean) {
    if (!supabase) throw new InputError(previewNotice);
    let image = value instanceof File && value.size ? value : null;
    const includedBanner = bankThemeRegistry[theme].defaultBanner;
    if (useIncluded && !includedBanner) throw new InputError('Elegí un diseño de entidad con banner incluido.');
    if (!image && includedBanner) {
      const { data: currentTheme, error: themeReadError } = await supabase.from('bank_themes').select('background_path').eq('key', theme).maybeSingle();
      if (themeReadError) throw themeReadError;
      if (currentTheme?.background_path && !useIncluded) return;
      const response = await fetch(includedBanner);
      if (!response.ok) throw new InputError(`No pudimos cargar el banner predeterminado de ${bankThemeRegistry[theme].name}.`);
      image = new File([await response.blob()], `${theme}-banner.png`, { type: 'image/png' });
    }
    if (!image) return;
    if (!['image/jpeg','image/png','image/webp'].includes(image.type) || image.size > 5 * 1024 * 1024) throw new InputError('El banner debe ser JPG, PNG o WebP y pesar hasta 5 MB.');
    const extension = image.type === 'image/jpeg' ? 'jpg' : image.type === 'image/png' ? 'png' : 'webp';
    const path = `bank-themes/${theme}/banner-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('app-assets').upload(path, image, { upsert: true, contentType: image.type, cacheControl: '3600' });
    if (uploadError) throw new InputError('No pudimos guardar el banner bancario.');
    const { error: themeError } = await supabase.from('bank_themes').update({ background_path: path, updated_at: new Date().toISOString() }).eq('key', theme);
    if (themeError) throw themeError;
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await action(async () => {
      const fields = readAccount(form);
      const current = accounts.find(item => item.id === editingId) ?? null;
      if (demo || !supabase) throw new InputError(previewNotice);
      await uploadThemeBanner(form.get('theme_banner'), fields.theme_key, form.get('included_banner') === '1');
      const query = current ? supabase.from('bank_accounts').update(fields).eq('id', current.id) : supabase.from('bank_accounts').insert({ ...fields, active: true });
      const { data, error } = await query.select(accountColumns).single();
      if (error || !data) throw persistError(error ?? { message: 'No se pudo guardar la cuenta.' });
      const { data: themes } = await supabase.from('bank_themes').select('key,background_path,logo_path').eq('key', data.theme_key);
      const saved = attachThemeAssets([data as Record<string, unknown>], (themes ?? []) as { key: string; background_path: string | null; logo_path: string | null }[])[0];
      setAccounts(old => current ? old.map(item => item.id === saved.id ? saved : item) : [...old, saved]);
      setSelectedShift(saved.shift_key);
      setEditingId(null);
      element.reset();
    });
  }

  async function toggleAccount(account: Account) {
    await action(async () => {
      if (demo || !supabase) throw new InputError(previewNotice);
      const { data, error } = await supabase.from('bank_accounts').update({ active: !account.active }).eq('id', account.id).select('id,active').single();
      if (error || !data) throw persistError(error ?? { message: 'No se pudo guardar la cuenta.' });
      setAccounts(old => old.map(item => item.id === account.id ? { ...item, active: data.active } : item));
    });
  }

  async function removeAccount(account: Account) {
    if (!window.confirm(`¿Eliminar la cuenta de ${account.bank}?`)) return;
    await action(async () => {
      if (demo || !supabase) throw new InputError(previewNotice);
      const { data, error } = await supabase.from('bank_accounts').delete().eq('id', account.id).select('id');
      if (error) throw persistError(error);
      if (!data?.length) throw new InputError('Esa cuenta ya no está.');
      setAccounts(old => old.filter(item => item.id !== account.id));
      if (editingId === account.id) setEditingId(null);
    });
  }

  return <section className="account-admin" aria-labelledby="account-title">
    <div className="account-heading"><div><h1 id="account-title">Cuentas</h1><p>Organizá las cuentas de cada turno y el teléfono donde está cada una.</p></div><strong>{accounts.length} cuentas</strong></div>
    <div className="shift-tabs" role="tablist" aria-label="Turno de las cuentas">
      {shifts.map(shift => {
        const count = accounts.filter(account => account.shift_key === shift.key).length;
        return <button type="button" role="tab" aria-selected={selectedShift === shift.key} className={selectedShift === shift.key ? 'active' : ''} key={shift.key} onClick={() => { setSelectedShift(shift.key); setEditingId(null); }}>{shift.label}<small>{count}</small></button>;
      })}
    </div>
    <form className="account-create" key={editing?.id ?? `new-${selectedShift}`} onSubmit={saveAccount}>
      <p>{demo ? previewNotice : editing ? 'Editando esta cuenta.' : `Nueva cuenta para ${shiftLabel[selectedShift].toLowerCase()}.`}</p>
      <input type="hidden" name="shift_key" value={editing?.shift_key ?? selectedShift} />
      <label>Banco<input name="bank" maxLength={80} placeholder="Ejemplo: Mercado Pago" defaultValue={editing?.bank ?? ''} required /></label>
      <label>Diseño de la tarjeta<select name="theme_key" defaultValue={editing?.theme_key ?? 'default'}>{Object.values(bankThemeRegistry).map(theme => <option value={theme.key} key={theme.key}>{theme.name}</option>)}</select></label>
      <label>Banner del diseño <span>(opcional; los diseños de entidades incluyen su propio banner)</span><input name="theme_banner" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input name="included_banner" type="checkbox" value="1" style={{ width: 20, minHeight: 20, flexShrink: 0 }} />Reemplazar el banner actual por el incluido del diseño</label>
      <label>Titular<input name="holder" maxLength={120} autoComplete="name" placeholder="Nombre y apellido" defaultValue={editing?.holder ?? ''} required /></label>
      <label>CBU / CVU<input name="cbu" inputMode="decimal" pattern="[0-9. \-]{22,34}" maxLength={34} placeholder="22 números, con o sin puntos" autoCapitalize="none" spellCheck={false} defaultValue={editing?.cbu ?? ''} required /></label>
      <label>Alias<input name="alias" maxLength={20} autoCapitalize="none" spellCheck={false} placeholder="tu.alias" defaultValue={editing?.alias ?? ''} required /></label>
      <label>Teléfono<input name="phone_number" type="number" min={1} max={30} step={1} inputMode="numeric" placeholder="1" defaultValue={editing?.phone_number ?? ''} required /></label>
      <div className="account-form-actions">
        <button type="submit" disabled={busy || loading}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : `Agregar a ${shiftLabel[selectedShift]}`}</button>
        {editing && <button type="button" disabled={busy} onClick={() => setEditingId(null)}>Cancelar</button>}
      </div>
    </form>
    {loading ? <p className="empty">Cargando cuentas…</p> : loadError ? <p className="empty">{loadError}</p> : !visibleAccounts.length ? <p className="empty">Todavía no hay cuentas en {shiftLabel[selectedShift].toLowerCase()}.</p> : groupAccountsByPhone(visibleAccounts).map(group => <section className={`account-phone-group${group.phone === null ? ' unassigned' : ''}`} key={group.phone ?? 'none'} aria-label={group.phone === null ? 'Cuentas sin teléfono' : `Teléfono ${group.phone}`}>
      <header><h2>{group.phone === null ? 'Sin teléfono' : `Teléfono ${group.phone}`}</h2><p>{group.phone === null ? 'Poneles un número para poder elegirlas en un SAC.' : `${group.items.length} ${group.items.length === 1 ? 'cuenta' : 'cuentas'}`}</p></header>
      <div className="account-offers">
      {group.items.map(account => <article className={`account-offer${account.active ? '' : ' inactive'}${editing?.id === account.id ? ' editing' : ''}`} key={account.id}>
        <div className="account-offer-banner">
          <BankTransferCard bank={account} compact />
          <div className="account-offer-management">
            <div className="account-offer-details"><span>CBU/CVU · {account.cbu}</span><div className="account-offer-statusline"><strong className={`account-offer-state${account.active ? '' : ' paused'}`}>{account.active ? 'Disponible' : 'Pausada'}</strong><small>{account.phone_number ? `Teléfono ${account.phone_number}` : 'Sin teléfono'}</small><small>{account.usage_count} usos confirmados</small></div></div>
            <div className="account-offer-actions">
              <button type="button" disabled={busy} onClick={() => { setEditingId(account.id); document.getElementById('account-title')?.scrollIntoView({ block: 'start' }); }}>Editar</button>
              <button type="button" disabled={busy} onClick={() => void toggleAccount(account)}>{account.active ? 'Pausar' : 'Habilitar'}</button>
              <button type="button" disabled={busy} onClick={() => void removeAccount(account)}>Eliminar</button>
            </div>
          </div>
        </div>
      </article>)}
      </div>
    </section>)}
  </section>;
}
