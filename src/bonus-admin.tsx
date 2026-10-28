import { useEffect, useState, type FormEvent, type ChangeEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { asBonusRule, percentText, type BonusMode } from '../supabase/functions/_shared/bonus-rule';
import { assertFormFields, InputError, parseBonusRule } from '../supabase/functions/_shared/validation';
import { money, supabase } from './lib';
import { StorageImage, useContent } from './content';
import { BannerLayoutEditor } from './banner-layout-editor';
import { defaultBonusBannerLayout, normalizeBonusBannerLayout, specialBonusDisplayLayout } from './bonus-banner-layout';
import { bannerImageExtension } from './home-banner';
import { themeBase } from './portal-theme-design';
import type { HomeBannerLayout } from './home-banner';

export type BonusOffer = {
  id: string;
  title: string;
  bonus_mode: BonusMode;
  bonus_percent: number;
  bonus_amount: number;
  min_amount: number;
  max_amount: number;
  cooldown_hours: number;
  image_path: string | null;
  banner_layout: HomeBannerLayout;
  active: boolean;
  sort_order: number;
};

const offerColumns = 'id,title,bonus_mode,bonus_percent,bonus_amount,min_amount,max_amount,cooldown_hours,image_path,banner_layout,active,sort_order';
const previewNotice = 'La vista previa no guarda los bonos. Entrá con la cuenta de administrador para que el usuario pueda elegirlos al cargar.';

function persistError(error: { code?: string; message?: string }): Error {
  const message = error.message ?? '';
  if (/cooldown_hours|banner_layout|promotions_special_fixed/i.test(message)) {
    return new InputError('Falta aplicar la migración 057 de bonos especiales en Supabase.');
  }
  if (/bonus_mode|min_amount|max_amount|bonus_amount|promotions_bonus_rule/i.test(message)) {
    return new InputError('La base todavía no acepta el mínimo, el máximo o el monto fijo. Aplicá la migración 010 y volvé a intentar.');
  }
  if (error.code === '42501' || error.code === 'PGRST301' || /row-level security|permission denied|jwt/i.test(message)) {
    return new InputError('No se pudo guardar el bono. Entrá de nuevo con la cuenta de administrador.');
  }
  if (error.code === '23514') return new InputError('El bono no se pudo guardar. Revisá el mínimo, el máximo y que el porcentaje o el monto fijo sea mayor a cero.');
  return error instanceof Error ? error : new Error(message || 'No se pudo guardar el bono.');
}

function offerFromRow(row: { id: string; title: string; active: boolean; bonus_mode?: string | null; bonus_percent?: number | null; bonus_amount?: number | null; min_amount?: number | null; max_amount?: number | null; cooldown_hours?: number | null; image_path?: string | null; banner_layout?: unknown; sort_order?: number | null }, theme: ReturnType<typeof themeBase>): BonusOffer {
  return { id: row.id, title: row.title, active: row.active, ...asBonusRule(row), cooldown_hours: Number(row.cooldown_hours) || 0, image_path: row.image_path ?? null, banner_layout: normalizeBonusBannerLayout(row.banner_layout, theme), sort_order: Number(row.sort_order) || 0 };
}

function offerDetail(bonus: BonusOffer) {
  const value = bonus.bonus_mode === 'fixed' ? `+${money(bonus.bonus_amount)}` : `+${percentText(bonus.bonus_percent)}%`;
  return `${value} · de ${money(bonus.min_amount)} a ${money(bonus.max_amount)}${bonus.cooldown_hours ? ` · cada ${bonus.cooldown_hours} h` : ''} · ${bonus.active ? 'Disponible para cargar' : 'Pausado'}`;
}

export function BonusAdmin({ demo, busy, action }: { demo: boolean; busy: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const { settings, reloadPromotions } = useContent();
  const theme = themeBase(settings);
  const [bonuses, setBonuses] = useState<BonusOffer[]>([]);
  const [loading, setLoading] = useState(!demo && !!supabase);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<BonusMode>('percent');
  const [timed, setTimed] = useState(false);
  const [savedLayoutId, setSavedLayoutId] = useState<string | null>(null);
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
        setLoadError(/bonus_mode|bonus_amount|min_amount|max_amount|cooldown_hours|banner_layout/i.test(error.message ?? '')
          ? 'Falta aplicar la migración 057 de bonos especiales en Supabase.'
          : 'No pudimos cargar los bonos.');
        return;
      }
      setBonuses((data ?? []).map(row => offerFromRow(row, theme)));
    });
    return () => { alive = false; };
  }, [demo, theme]);
  async function createBonus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await action(async () => {
      assertFormFields(form, timed
        ? ['title', 'mode', 'value', 'min_amount', 'max_amount', 'cooldown_hours']
        : ['title', 'mode', 'value', 'min_amount', 'max_amount']);
      const rule = parseBonusRule(form);
      const hours = timed ? Number(form.get('cooldown_hours')) : 0;
      if (timed && (rule.bonus_mode !== 'fixed' || !Number.isInteger(hours) || hours < 1 || hours > 720)) throw new InputError('El bono especial debe ser de monto fijo y esperar entre 1 y 720 horas.');
      const current = bonuses.find(item => item.id === editingId) ?? null;
      if (demo || !supabase) throw new InputError(previewNotice);
      const payload = {
        title: rule.title, bonus_mode: rule.bonus_mode, bonus_percent: rule.bonus_percent,
        bonus_amount: rule.bonus_amount, min_amount: rule.min_amount, max_amount: rule.max_amount, cooldown_hours: hours,
      };
      const query = current
        ? supabase.from('promotions').update(payload).eq('id', current.id).eq('selectable', true)
        : supabase.from('promotions').insert({ ...payload, description: '', active: true, selectable: true, show_banner: false, sort_order: bonuses.length, banner_layout: defaultBonusBannerLayout(theme) });
      const { data, error } = await query.select(offerColumns).single();
      if (error || !data) throw persistError(error ?? { message: 'No se pudo guardar el bono.' });
      const saved = offerFromRow(data, theme);
      setBonuses(old => current ? old.map(item => item.id === saved.id ? { ...item, ...saved } : item) : [...old, saved]);
      setEditingId(null);
      setMode('percent');
      setTimed(false);
      element.reset();
      reloadPromotions();
    });
  }
  function beginEdit(bonus: BonusOffer) {
    setEditingId(bonus.id);
    setMode(bonus.bonus_mode);
    setTimed(bonus.cooldown_hours > 0);
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
      if (editingId === bonus.id) { setEditingId(null); setMode('percent'); setTimed(false); }
      reloadPromotions();
    });
  }
  async function toggleBonus(bonus: BonusOffer) {
    await action(async () => {
      const active = !bonus.active;
      if (demo || !supabase) throw new InputError(previewNotice);
      const { data, error } = await supabase.from('promotions').update({ active }).eq('id', bonus.id).eq('selectable', true).select('id,active').single();
      if (error || !data) throw persistError(error ?? { message: 'No se pudo guardar el bono.' });
      setBonuses(old => old.map(item => item.id === bonus.id ? { ...item, active: data.active } : item));
      reloadPromotions();
    });
  }
  async function moveBonus(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= bonuses.length) return;
    await action(async () => {
      if (demo || !supabase) throw new InputError(previewNotice);
      const reordered = [...bonuses];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      const ordered = reordered.map((bonus, sort_order) => ({ ...bonus, sort_order }));
      const results = await Promise.all(ordered.map(bonus => supabase!.from('promotions').update({ sort_order: bonus.sort_order }).eq('id', bonus.id).eq('selectable', true)));
      const failed = results.find(result => result.error);
      if (failed?.error) throw persistError(failed.error);
      setBonuses(ordered);
      reloadPromotions();
    });
  }
  async function uploadImage(bonus: BonusOffer, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await action(async () => {
      if (demo || !supabase) throw new InputError(previewNotice);
      const videoExtension = file.type === 'video/mp4' ? 'mp4' : file.type === 'video/webm' ? 'webm' : null;
      if (videoExtension && (!file.size || file.size > 20 * 1024 * 1024)) throw new InputError('El video debe pesar hasta 20 MB.');
      const extension = videoExtension ?? await bannerImageExtension(file);
      const path = `home-bonus/${crypto.randomUUID()}.${extension}`;
      const uploaded = await supabase.storage.from('app-assets').upload(path, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw uploaded.error;
      const { error } = await supabase.from('promotions').update({ image_path: path }).eq('id', bonus.id);
      if (error) throw persistError(error);
      setBonuses(old => old.map(item => item.id === bonus.id ? { ...item, image_path: path } : item));
      reloadPromotions();
    });
  }
  async function saveLayout(bonus: BonusOffer) {
    await action(async () => {
      if (demo || !supabase) throw new InputError(previewNotice);
      const { error } = await supabase.from('promotions').update({ banner_layout: bonus.banner_layout }).eq('id', bonus.id);
      if (error) throw persistError(error);
      setSavedLayoutId(bonus.id);
      reloadPromotions();
    });
  }
  return <section className="bonus-admin" aria-labelledby="bonus-title">
    <h1 id="bonus-title">Bonos</h1>
    <form className="bonus-create" key={editing?.id ?? 'new'} onSubmit={createBonus}>
      <p>{demo ? previewNotice : editing ? 'Los cambios valen para las próximas cargas. Las que ya se enviaron conservan el valor anterior.' : 'Cada bono se mostrará en el apartado Bonos con su propio banner y botón Obtener.'}</p>
      <label>Nombre<input name="title" maxLength={80} placeholder="Ejemplo: Recarga" defaultValue={editing?.title ?? ''} required /></label>
      <label className="bonus-special-toggle"><input type="checkbox" checked={timed} onChange={event => { setTimed(event.target.checked); if (event.target.checked) setMode('fixed'); }} /> Bono especial con tiempo de espera y banner</label>
      <fieldset className="bonus-mode">
        <legend>Tipo de bono</legend>
        <label className={mode === 'percent' ? 'selected' : ''}><input type="radio" name="mode" value="percent" checked={mode === 'percent'} disabled={timed} onChange={() => setMode('percent')} />Porcentaje</label>
        <label className={mode === 'fixed' ? 'selected' : ''}><input type="radio" name="mode" value="fixed" checked={mode === 'fixed'} onChange={() => setMode('fixed')} />Monto fijo</label>
      </fieldset>
      <label>{mode === 'percent' ? 'Porcentaje' : 'Monto del bono'}<input name="value" inputMode="decimal" maxLength={18} placeholder={mode === 'percent' ? '10' : '5.000'} defaultValue={editing ? String(editing.bonus_mode === 'fixed' ? editing.bonus_amount : editing.bonus_percent) : ''} required /></label>
      {timed && <label>Disponible nuevamente después de (horas)<input name="cooldown_hours" type="number" min="1" max="720" step="1" defaultValue={editing?.cooldown_hours || 6} required /></label>}
      <div className="bonus-range">
        <label>Monto mínimo<input name="min_amount" inputMode="decimal" maxLength={18} placeholder="10.000" defaultValue={editing ? String(editing.min_amount) : ''} required /></label>
        <label>Monto máximo<input name="max_amount" inputMode="decimal" maxLength={18} placeholder="50.000" defaultValue={editing ? String(editing.max_amount) : ''} required /></label>
      </div>
      <div className="bonus-form-actions">
        <button type="submit" disabled={busy || loading}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear bono'}</button>
        {editing && <button type="button" disabled={busy} onClick={() => { setEditingId(null); setMode('percent'); setTimed(false); }}>Cancelar</button>}
      </div>
    </form>
    {loading ? <p className="empty">Cargando bonos…</p> : loadError ? <p className="empty">{loadError}</p> : !bonuses.length ? <p className="empty">Todavía no hay bonos. Los que crees aparecerán en el apartado Bonos del portal.</p> : <div className="bonus-offers">
      {bonuses.map((bonus, index) => <article className={`bonus-offer${bonus.active ? '' : ' inactive'}${editing?.id === bonus.id ? ' editing' : ''}`} key={bonus.id}>
        <div><strong>{bonus.title}</strong><small>{offerDetail(bonus)}</small></div>
        <div className="bonus-offer-actions">
          <button type="button" aria-label={`Mover ${bonus.title} hacia arriba`} title="Mover arriba" disabled={busy || demo || index === 0} onClick={() => void moveBonus(index, -1)}><ChevronUp size={16} /></button>
          <button type="button" aria-label={`Mover ${bonus.title} hacia abajo`} title="Mover abajo" disabled={busy || demo || index === bonuses.length - 1} onClick={() => void moveBonus(index, 1)}><ChevronDown size={16} /></button>
          <button type="button" disabled={busy} onClick={() => beginEdit(bonus)}>Editar</button>
          <button type="button" disabled={busy} onClick={() => void toggleBonus(bonus)}>{bonus.active ? 'Pausar' : 'Activar'}</button>
          <button type="button" disabled={busy} onClick={() => void removeBonus(bonus)}>Eliminar</button>
        </div>
        <div className="special-bonus-image-editor">
          <label className="portal-extra-add">{bonus.image_path ? 'Cambiar banner (imagen o video)' : 'Subir banner (imagen o video)'}<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" disabled={busy || demo} onChange={event => void uploadImage(bonus, event)} /></label>
          <small className="bonus-banner-guidance">Imagen JPG, PNG o WebP hasta 5 MB; tamaño recomendado: 720 × 400 px (relación 9:5). Video MP4 o WebM hasta 20 MB. Ajustá el encuadre en la vista previa.</small>
          <BannerLayoutEditor label={bonus.title} layout={bonus.banner_layout} previewLayout={{ ...specialBonusDisplayLayout(bonus.banner_layout), height: 55.6 }} defaults={defaultBonusBannerLayout(theme)} heightRange={[55.6, 55.6]} hideHeight disabled={busy || demo} saved={savedLayoutId === bonus.id} onChange={layout => { setBonuses(old => old.map(item => item.id === bonus.id ? { ...item, banner_layout: normalizeBonusBannerLayout(layout, theme) } : item)); setSavedLayoutId(null); }} onSave={() => void saveLayout(bonus)}>
            {bonus.image_path ? /\.(mp4|webm)$/i.test(bonus.image_path) ? <video src={supabase?.storage.from('app-assets').getPublicUrl(bonus.image_path).data.publicUrl} autoPlay muted loop playsInline /> : <StorageImage path={bonus.image_path} alt={bonus.title} /> : <span>{bonus.title} · imagen pendiente</span>}
            <div className="special-banner-copy"><span className="special-banner-name">{bonus.title}</span><span className="special-banner-minimum">Desde {money(bonus.min_amount)}</span><strong className="special-banner-reward">{bonus.bonus_mode === 'fixed' ? `+${money(bonus.bonus_amount)}` : `+${percentText(bonus.bonus_percent)}%`}</strong><button type="button">Obtener</button></div>
          </BannerLayoutEditor>
        </div>
      </article>)}
    </div>}
  </section>;
}
