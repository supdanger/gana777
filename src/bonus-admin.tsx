import { useEffect, useState, type FormEvent, type ChangeEvent, type CSSProperties } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { asBonusRule, percentText, type BonusMode } from '../supabase/functions/_shared/bonus-rule';
import { assertFormFields, InputError, parseAmount, parseBonusLoadNumber, parseBonusRewardLabel, parseBonusRule, parseBonusRulesText, parseBonusTitle } from '../supabase/functions/_shared/validation';
import { money, supabase } from './lib';
import { StorageImage, useContent } from './content';
import { BannerLayoutEditor } from './banner-layout-editor';
import { bonusButtonLayoutStyles, defaultBonusBannerLayout, normalizeBonusBannerLayout, specialBonusDisplayLayout, type BonusBannerLayout } from './bonus-banner-layout';
import { bannerImageExtension } from './home-banner';
import { themeBase } from './portal-theme-design';

export type BonusOffer = {
  id: string;
  title: string;
  reward_type: 'cash' | 'free_spins';
  reward_label: string;
  rules_text: string;
  bonus_mode: BonusMode;
  bonus_percent: number;
  bonus_amount: number;
  min_amount: number;
  max_amount: number;
  load_number_from: number;
  load_number_to: number | null;
  cooldown_hours: number;
  daily_reset_time: string | null;
  image_path: string | null;
  banner_layout: BonusBannerLayout;
  active: boolean;
  sort_order: number;
};

const offerColumns = 'id,title,reward_type,reward_label,rules_text,bonus_mode,bonus_percent,bonus_amount,min_amount,max_amount,load_number_from,load_number_to,cooldown_hours,daily_reset_time,image_path,banner_layout,active,sort_order';
const previewNotice = 'La vista previa no guarda los bonos. Entrá con la cuenta de administrador para que el usuario pueda elegirlos al cargar.';

function persistError(error: { code?: string; message?: string }): Error {
  const message = error.message ?? '';
  if (/reward_type|reward_label/i.test(message)) {
    return new InputError('Falta aplicar la migración 067 de premios de giros gratis en Supabase.');
  }
  if (/rules_text/i.test(message)) return new InputError('Falta aplicar la migración 068 de información de bonos en Supabase.');
  if (/load_number_from|load_number_to|promotions_load_number_window/i.test(message)) return new InputError('Falta aplicar la migración 069 de disponibilidad por número de carga en Supabase.');
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

function offerFromRow(row: { id: string; title: string; reward_type?: string | null; reward_label?: string | null; rules_text?: string | null; active: boolean; bonus_mode?: string | null; bonus_percent?: number | null; bonus_amount?: number | null; min_amount?: number | null; max_amount?: number | null; load_number_from?: number | null; load_number_to?: number | null; cooldown_hours?: number | null; daily_reset_time?: string | null; image_path?: string | null; banner_layout?: unknown; sort_order?: number | null }, theme: ReturnType<typeof themeBase>): BonusOffer {
  return { id: row.id, title: row.title, reward_type: row.reward_type === 'free_spins' ? 'free_spins' : 'cash', reward_label: row.reward_label ?? '', rules_text: row.rules_text ?? '', active: row.active, ...asBonusRule(row), load_number_from: Number(row.load_number_from) || 1, load_number_to: row.load_number_to == null ? null : Number(row.load_number_to), cooldown_hours: Number(row.cooldown_hours) || 0, daily_reset_time: row.daily_reset_time ?? null, image_path: row.image_path ?? null, banner_layout: normalizeBonusBannerLayout(row.banner_layout, theme), sort_order: Number(row.sort_order) || 0 };
}

function offerDetail(bonus: BonusOffer) {
  const value = bonus.reward_type === 'free_spins' ? bonus.reward_label : bonus.bonus_mode === 'fixed' ? `+${money(bonus.bonus_amount)}` : `+${percentText(bonus.bonus_percent)}%`;
  const loads = bonus.load_number_to === null ? bonus.load_number_from === 1 ? 'todas las cargas' : `desde carga ${bonus.load_number_from}` : bonus.load_number_from === bonus.load_number_to ? `solo carga ${bonus.load_number_from}` : `cargas ${bonus.load_number_from}–${bonus.load_number_to}`;
  return `${value} · de ${money(bonus.min_amount)} a ${money(bonus.max_amount)} · ${loads}${bonus.cooldown_hours ? ` · ${bonus.daily_reset_time ? `reinicia ${bonus.daily_reset_time.slice(0,5)}` : `cada ${bonus.cooldown_hours} h`}` : ''} · ${bonus.active ? 'Disponible para cargar' : 'Pausado'}`;
}

export function BonusAdmin({ demo, busy, action }: { demo: boolean; busy: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const { settings, reloadPromotions } = useContent();
  const theme = themeBase(settings);
  const [bonuses, setBonuses] = useState<BonusOffer[]>([]);
  const [loading, setLoading] = useState(!demo && !!supabase);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<BonusMode>('percent');
  const [rewardType, setRewardType] = useState<'cash' | 'free_spins'>('cash');
  const [rewardValue, setRewardValue] = useState('');
  const [loadNumberFrom, setLoadNumberFrom] = useState('1');
  const [loadNumberTo, setLoadNumberTo] = useState('');
  const [allLoads, setAllLoads] = useState(true);
  const [timed, setTimed] = useState(false);
  const [resetTime, setResetTime] = useState('23:00');
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
        setLoadError(/load_number_from|load_number_to/i.test(error.message ?? '')
          ? 'Falta aplicar la migración 069 de disponibilidad por número de carga en Supabase.'
          : /rules_text/i.test(error.message ?? '')
          ? 'Falta aplicar la migración 068 de información de bonos en Supabase.'
          : /reward_type|reward_label/i.test(error.message ?? '')
          ? 'Falta aplicar la migración 067 de premios de giros gratis en Supabase.'
          : /bonus_mode|bonus_amount|min_amount|max_amount|cooldown_hours|banner_layout/i.test(error.message ?? '')
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
        ? ['title', 'reward_type', 'mode', 'value', 'rules_text', 'min_amount', 'max_amount', 'load_number_from', 'load_number_to', 'all_loads', ...(form.get('reward_type') === 'free_spins' ? ['daily_reset_time'] : ['cooldown_hours'])]
        : ['title', 'reward_type', 'mode', 'value', 'rules_text', 'min_amount', 'max_amount', 'load_number_from', 'load_number_to', 'all_loads']);
      const selectedRewardType = form.get('reward_type') === 'free_spins' ? 'free_spins' : 'cash';
      const rule = selectedRewardType === 'free_spins'
        ? { title: parseBonusTitle(form.get('title')), bonus_mode: 'fixed' as const, bonus_percent: 0, bonus_amount: 0, min_amount: parseAmount(form.get('min_amount')), max_amount: parseAmount(form.get('max_amount')) }
        : parseBonusRule(form);
      if (rule.max_amount < rule.min_amount) throw new InputError('El monto máximo tiene que ser igual o mayor que el mínimo.');
      const rewardLabel = selectedRewardType === 'free_spins' ? parseBonusRewardLabel(form.get('value')) : '';
      const rulesText = parseBonusRulesText(form.get('rules_text'));
      const loadFrom = parseBonusLoadNumber(form.get('load_number_from'), 'Carga inicial');
      const loadTo = form.get('all_loads') === 'true' ? null : parseBonusLoadNumber(form.get('load_number_to'), 'Carga final');
      if (loadTo !== null && loadTo < loadFrom) throw new InputError('La carga final debe ser igual o mayor que la carga inicial.');
      const dailyReset = timed && selectedRewardType === 'free_spins' ? String(form.get('daily_reset_time') ?? '') : null;
      const hours = timed ? selectedRewardType === 'free_spins' ? 24 : Number(form.get('cooldown_hours')) : 0;
      if (dailyReset !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyReset)) throw new InputError('Elegí una hora válida para el reinicio diario.');
      if (timed && (selectedRewardType === 'cash' && rule.bonus_mode !== 'fixed' || !Number.isInteger(hours) || hours < 1 || hours > 720)) throw new InputError('El bono especial debe ser de monto fijo o giros gratis, y esperar entre 1 y 720 horas.');
      const current = bonuses.find(item => item.id === editingId) ?? null;
      if (demo || !supabase) throw new InputError(previewNotice);
      const payload = {
        reward_type: selectedRewardType, reward_label: rewardLabel, rules_text: rulesText,
        title: rule.title, bonus_mode: rule.bonus_mode, bonus_percent: rule.bonus_percent,
        bonus_amount: rule.bonus_amount, min_amount: rule.min_amount, max_amount: rule.max_amount,
        load_number_from: loadFrom, load_number_to: loadTo, cooldown_hours: hours, daily_reset_time: dailyReset,
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
      setRewardType('cash');
      setRewardValue('');
      setLoadNumberFrom('1'); setLoadNumberTo(''); setAllLoads(true);
      setTimed(false); setResetTime('23:00');
      element.reset();
      reloadPromotions();
    });
  }
  function beginEdit(bonus: BonusOffer) {
    setEditingId(bonus.id);
    setMode(bonus.bonus_mode);
    setRewardType(bonus.reward_type);
    setRewardValue(bonus.reward_type === 'free_spins' ? bonus.reward_label : String(bonus.bonus_mode === 'fixed' ? bonus.bonus_amount : bonus.bonus_percent));
    setLoadNumberFrom(String(bonus.load_number_from)); setLoadNumberTo(bonus.load_number_to === null ? '' : String(bonus.load_number_to)); setAllLoads(bonus.load_number_to === null);
    setTimed(bonus.cooldown_hours > 0); setResetTime(bonus.daily_reset_time?.slice(0, 5) ?? '23:00');
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
      if (editingId === bonus.id) { setEditingId(null); setMode('percent'); setRewardType('cash'); setTimed(false); setLoadNumberFrom('1'); setLoadNumberTo(''); setAllLoads(true); }
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
  function updateButtonLayout(bonus: BonusOffer, key: 'buttonX' | 'buttonY' | 'buttonScale', value: number) {
    setBonuses(old => old.map(item => item.id === bonus.id ? { ...item, banner_layout: { ...item.banner_layout, [key]: value } } : item));
    setSavedLayoutId(null);
  }
  return <section className="bonus-admin" aria-labelledby="bonus-title">
    <h1 id="bonus-title">Bonos</h1>
    <form className="bonus-create" key={editing?.id ?? 'new'} onSubmit={createBonus}>
      <p>{demo ? previewNotice : editing ? 'Los cambios valen para las próximas cargas. Las que ya se enviaron conservan el valor anterior.' : 'Cada bono se mostrará en el apartado Bonos con su propio banner y botón Obtener.'}</p>
      <label>Nombre<input name="title" maxLength={80} placeholder="Ejemplo: Recarga" defaultValue={editing?.title ?? ''} required /></label>
      <fieldset className="bonus-mode">
        <legend>Tipo de premio</legend>
        <label className={rewardType === 'cash' ? 'selected' : ''}><input type="radio" name="reward_type" value="cash" checked={rewardType === 'cash'} onChange={() => { setRewardType('cash'); setRewardValue(''); }} />Bono en dinero</label>
        <label className={rewardType === 'free_spins' ? 'selected' : ''}><input type="radio" name="reward_type" value="free_spins" checked={rewardType === 'free_spins'} onChange={() => { setRewardType('free_spins'); setRewardValue(''); }} />Giros gratis</label>
      </fieldset>
      <label>Reglas e información para el jugador<textarea name="rules_text" maxLength={2000} rows={4} defaultValue={editing?.rules_text ?? ''} placeholder="Explicá cómo funciona el bono, requisitos de apuesta, vigencia y restricciones. Podés dejarlo vacío." /></label>
      <label className="bonus-special-toggle"><input type="checkbox" checked={timed} onChange={event => { setTimed(event.target.checked); if (event.target.checked && rewardType === 'cash') setMode('fixed'); }} /> Bono especial con tiempo de espera y banner</label>
      <fieldset className="bonus-mode">
        <legend>Tipo de bono</legend>
        {rewardType === 'free_spins' && <input type="hidden" name="mode" value="fixed" />}
        <label className={mode === 'percent' ? 'selected' : ''}><input type="radio" name="mode" value="percent" checked={mode === 'percent'} disabled={timed || rewardType === 'free_spins'} onChange={() => setMode('percent')} />Porcentaje</label>
        <label className={mode === 'fixed' ? 'selected' : ''}><input type="radio" name="mode" value="fixed" checked={mode === 'fixed'} disabled={rewardType === 'free_spins'} onChange={() => setMode('fixed')} />Monto fijo</label>
      </fieldset>
      <label>{rewardType === 'free_spins' ? 'Nombre del premio de giros' : mode === 'percent' ? 'Porcentaje' : 'Monto del bono'}<input name="value" inputMode={rewardType === 'free_spins' ? 'text' : 'decimal'} maxLength={rewardType === 'free_spins' ? 80 : 18} placeholder={rewardType === 'free_spins' ? 'Ejemplo: 25 giros gratis' : mode === 'percent' ? '10' : '5.000'} value={rewardValue} onChange={event => setRewardValue(event.target.value)} required /></label>
      {timed && (rewardType === 'free_spins' ? <label>Reinicio diario (hora de Paraguay)<input name="daily_reset_time" type="time" value={resetTime} onChange={event => setResetTime(event.target.value)} required /></label> : <label>Disponible nuevamente después de (horas)<input name="cooldown_hours" type="number" min="1" max="720" step="1" defaultValue={editing?.cooldown_hours || 6} required /></label>)}
      <div className="bonus-range">
        <label>Monto mínimo<input name="min_amount" inputMode="decimal" maxLength={18} placeholder="10.000" defaultValue={editing ? String(editing.min_amount) : ''} required /></label>
        <label>Monto máximo<input name="max_amount" inputMode="decimal" maxLength={18} placeholder="50.000" defaultValue={editing ? String(editing.max_amount) : ''} required /></label>
      </div>
      <div className="bonus-load-window">
        <strong>¿En qué cargas se puede usar?</strong>
        <small>Se cuentan las cargas aprobadas. Solo la primera: desde 1 hasta 1. Todas: desde 1 y sin límite.</small>
        <div className="bonus-range">
          <label>Desde la carga n.º<input name="load_number_from" type="number" min="1" max="1000000" step="1" value={loadNumberFrom} onChange={event => setLoadNumberFrom(event.target.value)} required /></label>
          <label>Hasta la carga n.º<input name="load_number_to" type="number" min={loadNumberFrom || 1} max="1000000" step="1" value={loadNumberTo} onChange={event => setLoadNumberTo(event.target.value)} disabled={allLoads} required={!allLoads} /></label>
        </div>
        <label className="bonus-special-toggle"><input name="all_loads" type="checkbox" value="true" checked={allLoads} onChange={event => setAllLoads(event.target.checked)} />Sin límite: desde la carga inicial en adelante</label>
      </div>
      <div className="bonus-form-actions">
        <button type="submit" disabled={busy || loading}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear bono'}</button>
        {editing && <button type="button" disabled={busy} onClick={() => { setEditingId(null); setMode('percent'); setRewardType('cash'); setRewardValue(''); setTimed(false); setLoadNumberFrom('1'); setLoadNumberTo(''); setAllLoads(true); }}>Cancelar</button>}
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
          <BannerLayoutEditor label={bonus.title} layout={bonus.banner_layout} previewLayout={{ ...specialBonusDisplayLayout(bonus.banner_layout), height: 55.6 }} extraStyle={bonusButtonLayoutStyles(bonus.banner_layout) as CSSProperties} defaults={defaultBonusBannerLayout(theme)} heightRange={[55.6, 55.6]} hideHeight disabled={busy || demo} saved={savedLayoutId === bonus.id} onChange={layout => { setBonuses(old => old.map(item => item.id === bonus.id ? { ...item, banner_layout: normalizeBonusBannerLayout(layout, theme) } : item)); setSavedLayoutId(null); }} onSave={() => void saveLayout(bonus)}>
            {bonus.image_path ? /\.(mp4|webm)$/i.test(bonus.image_path) ? <video src={supabase?.storage.from('app-assets').getPublicUrl(bonus.image_path).data.publicUrl} autoPlay muted loop playsInline /> : <StorageImage path={bonus.image_path} alt={bonus.title} /> : <span>{bonus.title} · imagen pendiente</span>}
            <div className="special-banner-copy">{!bonus.image_path && <><span className="special-banner-name">{bonus.title}</span><span className="special-banner-minimum">Desde {money(bonus.min_amount)}</span><strong className="special-banner-reward">{bonus.reward_type === 'free_spins' ? bonus.reward_label : bonus.bonus_mode === 'fixed' ? `+${money(bonus.bonus_amount)}` : `+${percentText(bonus.bonus_percent)}%`}</strong></>}<button type="button">Obtener</button></div>
            <button type="button" className="player-bonus-info-button bonus-info-preview" aria-label="Vista previa del botón de información" title="Información" />
          </BannerLayoutEditor>
          <div className="bonus-button-layout-controls">
            <h4>Ubicación y tamaño del botón Obtener</h4>
            <label>Posición horizontal <output>{bonus.banner_layout.buttonX}%</output><input type="range" min="-45" max="45" step="1" value={bonus.banner_layout.buttonX} disabled={busy || demo} onChange={event => updateButtonLayout(bonus, 'buttonX', Number(event.target.value))} /></label>
            <label>Posición vertical (+ arriba) <output>{bonus.banner_layout.buttonY}%</output><input type="range" min="-30" max="30" step="1" value={bonus.banner_layout.buttonY} disabled={busy || demo} onChange={event => updateButtonLayout(bonus, 'buttonY', Number(event.target.value))} /></label>
            <label>Tamaño del botón <output>{bonus.banner_layout.buttonScale}%</output><input type="range" min="70" max="150" step="1" value={bonus.banner_layout.buttonScale} disabled={busy || demo} onChange={event => updateButtonLayout(bonus, 'buttonScale', Number(event.target.value))} /></label>
            <button type="button" disabled={busy || demo} onClick={() => { setBonuses(old => old.map(item => item.id === bonus.id ? { ...item, banner_layout: { ...item.banner_layout, buttonX: 0, buttonY: 0, buttonScale: 100 } } : item)); setSavedLayoutId(null); }}>Centrar y restablecer tamaño</button>
          </div>
          <div className="bonus-button-layout-controls">
            <h4>Ubicación y tamaño del botón de información</h4>
            {(['infoX', 'infoY', 'infoScale'] as const).map((key, index) => {
              const labels = ['Posición horizontal (− izquierda / + derecha)', 'Posición vertical (− arriba / + abajo)', 'Tamaño del botón'];
              const limits: Record<typeof key, [number, number]> = { infoX: [-45, 45], infoY: [-45, 45], infoScale: [60, 160] };
              return <label key={key}>{labels[index]} <output>{bonus.banner_layout[key]}%</output><input type="range" min={limits[key][0]} max={limits[key][1]} step="1" value={bonus.banner_layout[key]} disabled={busy || demo} onChange={event => { const value = Number(event.target.value); setBonuses(old => old.map(item => item.id === bonus.id ? { ...item, banner_layout: { ...item.banner_layout, [key]: value } } : item)); setSavedLayoutId(null); }} /></label>;
            })}
            <button type="button" disabled={busy || demo} onClick={() => { setBonuses(old => old.map(item => item.id === bonus.id ? { ...item, banner_layout: { ...item.banner_layout, infoX: 43, infoY: -37, infoScale: 100 } } : item)); setSavedLayoutId(null); }}>Restablecer posición y tamaño</button>
          </div>
        </div>
      </article>)}
    </div>}
  </section>;
}
