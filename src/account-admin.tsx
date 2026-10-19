import { useEffect, useState, type FormEvent } from 'react';
import { assertFormFields, InputError, parseAlias, parseBank, parseCbu, parseHolder } from '../supabase/functions/_shared/validation';
import { supabase, type Bank } from './lib';
import { shifts, shiftLabel, type ShiftKey } from './shifts';

type Account = Omit<Bank, 'assignment_id'> & { active: boolean; shift_key: ShiftKey; usage_count: number };
const accountColumns = 'id,bank,holder,cbu,alias,active,shift_key,usage_count';
const previewNotice = 'La vista previa no guarda las cuentas. Entrá como administrador para realizar cambios.';

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
    void db.from('bank_accounts').select(accountColumns).order('usage_count').order('bank').then(({ data, error }) => {
      if (!alive) return;
      setLoading(false);
      if (error) { setLoadError('No pudimos cargar las cuentas. Aplicá primero la migración de turnos.'); return; }
      setAccounts((data ?? []).map(item => ({ ...item, usage_count: Number(item.usage_count) || 0 })) as Account[]);
    });
    return () => { alive = false; };
  }, [demo]);

  function readAccount(form: FormData) {
    assertFormFields(form, ['bank', 'holder', 'cbu', 'alias', 'shift_key']);
    const alias = parseAlias(form.get('alias'));
    const shift = form.get('shift_key');
    if (!alias) throw new InputError('Ingresá el alias de la cuenta.');
    if (!shifts.some(item => item.key === shift)) throw new InputError('Elegí un turno válido.');
    return { bank: parseBank(form.get('bank')), holder: parseHolder(form.get('holder')), cbu: parseCbu(form.get('cbu')), alias, shift_key: shift as ShiftKey };
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await action(async () => {
      const fields = readAccount(form);
      const current = accounts.find(item => item.id === editingId) ?? null;
      if (demo || !supabase) throw new InputError(previewNotice);
      const query = current ? supabase.from('bank_accounts').update(fields).eq('id', current.id) : supabase.from('bank_accounts').insert({ ...fields, active: true });
      const { data, error } = await query.select(accountColumns).single();
      if (error || !data) throw persistError(error ?? { message: 'No se pudo guardar la cuenta.' });
      const saved = { ...data, usage_count: Number(data.usage_count) || 0 } as Account;
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
    <div className="account-heading"><div><h1 id="account-title">Cuentas</h1><p>Organizá las cuentas exclusivas de cada turno.</p></div><strong>{accounts.length} cuentas</strong></div>
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
      <label>Titular<input name="holder" maxLength={120} autoComplete="name" placeholder="Nombre y apellido" defaultValue={editing?.holder ?? ''} required /></label>
      <label>CBU / CVU<input name="cbu" inputMode="decimal" pattern="[0-9. \-]{22,34}" maxLength={34} placeholder="22 números, con o sin puntos" autoCapitalize="none" spellCheck={false} defaultValue={editing?.cbu ?? ''} required /></label>
      <label>Alias<input name="alias" maxLength={20} autoCapitalize="none" spellCheck={false} placeholder="tu.alias" defaultValue={editing?.alias ?? ''} required /></label>
      <div className="account-form-actions">
        <button type="submit" disabled={busy || loading}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : `Agregar a ${shiftLabel[selectedShift]}`}</button>
        {editing && <button type="button" disabled={busy} onClick={() => setEditingId(null)}>Cancelar</button>}
      </div>
    </form>
    {loading ? <p className="empty">Cargando cuentas…</p> : loadError ? <p className="empty">{loadError}</p> : !visibleAccounts.length ? <p className="empty">Todavía no hay cuentas en {shiftLabel[selectedShift].toLowerCase()}.</p> : <div className="account-offers">
      {visibleAccounts.map(account => <article className={`account-offer${account.active ? '' : ' inactive'}${editing?.id === account.id ? ' editing' : ''}`} key={account.id}>
        <div><strong>{account.bank}</strong><small>{account.holder}</small><small>{account.cbu}</small><small>{account.alias}</small><span className="account-usage">{account.usage_count} usos confirmados · {account.active ? 'Disponible' : 'Pausada'}</span></div>
        <div className="account-offer-actions">
          <button type="button" disabled={busy} onClick={() => { setEditingId(account.id); document.getElementById('account-title')?.scrollIntoView({ block: 'start' }); }}>Editar</button>
          <button type="button" disabled={busy} onClick={() => void toggleAccount(account)}>{account.active ? 'Pausar' : 'Habilitar'}</button>
          <button type="button" disabled={busy} onClick={() => void removeAccount(account)}>Eliminar</button>
        </div>
      </article>)}
    </div>}
  </section>;
}
