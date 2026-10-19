import { useEffect, useState, type FormEvent } from 'react';
import { asBonusRule, percentText, type BonusMode } from '../supabase/functions/_shared/bonus-rule';
import { assertFormFields, InputError, parseBonusRule } from '../supabase/functions/_shared/validation';
import { money, supabase } from './lib';

export type BonusOffer = {
  id: string;
  title: string;
  bonus_mode: BonusMode;
  bonus_percent: number;
  bonus_amount: number;
  min_amount: number;
  max_amount: number;
  active: boolean;
};

const offerColumns = 'id,title,bonus_mode,bonus_percent,bonus_amount,min_amount,max_amount,active';
const previewNotice = 'La vista previa no guarda los bonos. Entrá con la cuenta de administrador para que el usuario pueda elegirlos al cargar.';

function persistError(error: { code?: string; message?: string }): Error {
  const message = error.message ?? '';
  if (/bonus_mode|min_amount|max_amount|bonus_amount|promotions_bonus_rule/i.test(message)) {
    return new InputError('La base todavía no acepta el mínimo, el máximo o el monto fijo. Aplicá la migración 010 y volvé a intentar.');
  }
  if (error.code === '42501' || error.code === 'PGRST301' || /row-level security|permission denied|jwt/i.test(message)) {
    return new InputError('No se pudo guardar el bono. Entrá de nuevo con la cuenta de administrador.');
  }
  if (error.code === '23514') return new InputError('El bono no se pudo guardar. Revisá el mínimo, el máximo y que el porcentaje o el monto fijo sea mayor a cero.');
  return error instanceof Error ? error : new Error(message || 'No se pudo guardar el bono.');
}

function offerFromRow(row: { id: string; title: string; active: boolean; bonus_mode?: string | null; bonus_percent?: number | null; bonus_amount?: number | null; min_amount?: number | null; max_amount?: number | null }): BonusOffer {
  return { id: row.id, title: row.title, active: row.active, ...asBonusRule(row) };
}

function offerDetail(bonus: BonusOffer) {
  const value = bonus.bonus_mode === 'fixed' ? `+${money(bonus.bonus_amount)}` : `+${percentText(bonus.bonus_percent)}%`;
  return `${value} · de ${money(bonus.min_amount)} a ${money(bonus.max_amount)} · ${bonus.active ? 'Disponible para cargar' : 'Pausado'}`;
}

export function BonusAdmin({ demo, busy, action }: { demo: boolean; busy: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const [bonuses, setBonuses] = useState<BonusOffer[]>([]);
  const [loading, setLoading] = useState(!demo && !!supabase);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<BonusMode>('percent');
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = bonuses.find(item => item.id === editingId) ?? null;
  useEffect(() => {
    if (demo || !supabase) { setLoading(false); return; }
    const db = supabase;
    let alive = true;
    void db.from('promotions').select(offerColumns).eq('selectable', true).order('sort_order').then(({ data, error }) => {
      if (!alive) return;
      setLoading(false);
      if (error) {
        setLoadError(/bonus_mode|bonus_amount|min_amount|max_amount/i.test(error.message ?? '')
          ? 'Falta aplicar la migración de bonos en Supabase. Después vas a poder guardar el mínimo, el máximo y el monto fijo.'
          : 'No pudimos cargar los bonos.');
        return;
      }
      setBonuses((data ?? []).map(row => offerFromRow(row)));
    });
    return () => { alive = false; };
  }, [demo]);
  async function createBonus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await action(async () => {
      assertFormFields(form, ['title', 'mode', 'value', 'min_amount', 'max_amount']);
      const rule = parseBonusRule(form);
      const current = bonuses.find(item => item.id === editingId) ?? null;
      if (demo || !supabase) throw new InputError(previewNotice);
      const payload = {
        title: rule.title, bonus_mode: rule.bonus_mode, bonus_percent: rule.bonus_percent,
        bonus_amount: rule.bonus_amount, min_amount: rule.min_amount, max_amount: rule.max_amount,
      };
      const query = current
        ? supabase.from('promotions').update(payload).eq('id', current.id).eq('selectable', true)
        : supabase.from('promotions').insert({ ...payload, description: '', active: true, selectable: true, show_banner: false, sort_order: bonuses.length });
      const { data, error } = await query.select(offerColumns).single();
      if (error || !data) throw persistError(error ?? { message: 'No se pudo guardar el bono.' });
      const saved = offerFromRow(data);
      setBonuses(old => current ? old.map(item => item.id === saved.id ? { ...item, ...saved } : item) : [...old, saved]);
      setEditingId(null);
      setMode('percent');
      element.reset();
    });
  }
  function beginEdit(bonus: BonusOffer) {
    setEditingId(bonus.id);
    setMode(bonus.bonus_mode);
    document.getElementById('bonus-title')?.scrollIntoView({ block: 'start' });
  }
  async function removeBonus(bonus: BonusOffer) {
    if (!window.confirm(`¿Eliminar el bono ${bonus.title}? Esta acción no se puede deshacer.`)) return;
    await action(async () => {
      if (demo || !supabase) throw new InputError(previewNotice);
      const { data, error } = await supabase.from('promotions').delete().eq('id', bonus.id).eq('selectable', true).select('id');
      if (error) {
        if (error.code === '23503' || /foreign key|llave|violates/i.test(error.message ?? '')) {
          throw new InputError('Este bono ya se usó en cargas, así que no se puede borrar. Pausalo para que no siga disponible.');
        }
        throw persistError(error);
      }
      if (!data?.length) throw new InputError('Ese bono ya no está.');
      setBonuses(old => old.filter(item => item.id !== bonus.id));
      if (editingId === bonus.id) { setEditingId(null); setMode('percent'); }
    });
  }
  async function toggleBonus(bonus: BonusOffer) {
    await action(async () => {
      const active = !bonus.active;
      if (demo || !supabase) throw new InputError(previewNotice);
      const { data, error } = await supabase.from('promotions').update({ active }).eq('id', bonus.id).eq('selectable', true).select('id,active').single();
      if (error || !data) throw persistError(error ?? { message: 'No se pudo guardar el bono.' });
      setBonuses(old => old.map(item => item.id === bonus.id ? { ...item, active: data.active } : item));
    });
  }
  return <section className="bonus-admin" aria-labelledby="bonus-title">
    <h1 id="bonus-title">Bonos</h1>
    <form className="bonus-create" key={editing?.id ?? 'new'} onSubmit={createBonus}>
      <p>{demo ? previewNotice : editing ? 'Los cambios valen para las próximas cargas. Las que ya se enviaron conservan el valor anterior.' : 'El usuario ve el bono solo si el monto a cargar está entre el mínimo y el máximo.'}</p>
      <label>Nombre<input name="title" maxLength={80} placeholder="Ejemplo: Recarga" defaultValue={editing?.title ?? ''} required /></label>
      <fieldset className="bonus-mode">
        <legend>Tipo de bono</legend>
        <label className={mode === 'percent' ? 'selected' : ''}><input type="radio" name="mode" value="percent" checked={mode === 'percent'} onChange={() => setMode('percent')} />Porcentaje</label>
        <label className={mode === 'fixed' ? 'selected' : ''}><input type="radio" name="mode" value="fixed" checked={mode === 'fixed'} onChange={() => setMode('fixed')} />Monto fijo</label>
      </fieldset>
      <label>{mode === 'percent' ? 'Porcentaje' : 'Monto del bono'}<input name="value" inputMode="decimal" maxLength={18} placeholder={mode === 'percent' ? '10' : '5.000'} defaultValue={editing ? String(editing.bonus_mode === 'fixed' ? editing.bonus_amount : editing.bonus_percent) : ''} required /></label>
      <div className="bonus-range">
        <label>Monto mínimo<input name="min_amount" inputMode="decimal" maxLength={18} placeholder="10.000" defaultValue={editing ? String(editing.min_amount) : ''} required /></label>
        <label>Monto máximo<input name="max_amount" inputMode="decimal" maxLength={18} placeholder="50.000" defaultValue={editing ? String(editing.max_amount) : ''} required /></label>
      </div>
      <div className="bonus-form-actions">
        <button type="submit" disabled={busy || loading}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear bono'}</button>
        {editing && <button type="button" disabled={busy} onClick={() => { setEditingId(null); setMode('percent'); }}>Cancelar</button>}
      </div>
    </form>
    {loading ? <p className="empty">Cargando bonos…</p> : loadError ? <p className="empty">{loadError}</p> : !bonuses.length ? <p className="empty">Todavía no hay bonos. Los que crees van a aparecer cuando el usuario cargue.</p> : <div className="bonus-offers">
      {bonuses.map(bonus => <article className={`bonus-offer${bonus.active ? '' : ' inactive'}${editing?.id === bonus.id ? ' editing' : ''}`} key={bonus.id}>
        <div><strong>{bonus.title}</strong><small>{offerDetail(bonus)}</small></div>
        <div className="bonus-offer-actions">
          <button type="button" disabled={busy} onClick={() => beginEdit(bonus)}>Editar</button>
          <button type="button" disabled={busy} onClick={() => void toggleBonus(bonus)}>{bonus.active ? 'Pausar' : 'Activar'}</button>
          <button type="button" disabled={busy} onClick={() => void removeBonus(bonus)}>Eliminar</button>
        </div>
      </article>)}
    </div>}
  </section>;
}
