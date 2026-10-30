import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ImagePlus, RotateCcw } from 'lucide-react';
import { InputError } from '../supabase/functions/_shared/validation';
import { bannerImageExtension } from './home-banner';
import { supabase } from './lib';
import { cardSlots, defaultCardStyle, defaultThemeCardImageLayout, imageCardSlots, isCustomTheme, isImageCardSlot, normalizeCardStyle, normalizeThemeCardImageLayout, themeBase, type CardSlot, type ImageCardSlot, type PortalTheme, type ThemeDesign, type ThemeDesigns, type ThemeSettings } from './portal-theme-design';

const builtInBackgrounds: Record<string, string | null> = {
  christmas: '/preview-assets/christmas-background.webp',
  halloween: '/preview-assets/halloween-background.webp',
};

export function ThemeDesignAdmin({ theme, designs, demo, onSaved }: {
  theme: PortalTheme; designs: ThemeDesigns; demo: boolean; onSaved: (next: ThemeDesigns) => void;
}) {
  const settings: ThemeSettings = { portal_theme: theme, portal_theme_designs: designs };
  const [draft, setDraft] = useState<ThemeDesign>(() => structuredClone(designs[theme] ?? {}));
  const [slot, setSlot] = useState<CardSlot>('deposit');
  const [file, setFile] = useState<File | null>(null);
  const [cardImageFiles, setCardImageFiles] = useState<Partial<Record<ImageCardSlot, File>>>({});
  const [preview, setPreview] = useState('');
  const [cardImagePreview, setCardImagePreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(structuredClone(designs[theme] ?? {})); setFile(null); setCardImageFiles({}); setSaved(false); if (input.current) input.current.value = ''; }, [theme]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const selectedCardImageFile = isImageCardSlot(slot) ? cardImageFiles[slot] : undefined;
  useEffect(() => {
    if (!selectedCardImageFile) { setCardImagePreview(''); return; }
    const url = URL.createObjectURL(selectedCardImageFile); setCardImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedCardImageFile]);

  const base = themeBase(settings, theme);
  const selected = draft.cards?.[slot];
  const card = normalizeCardStyle(selected, defaultCardStyle(settings, theme));
  const storedBackground = draft.backgroundPath && supabase ? supabase.storage.from('app-assets').getPublicUrl(draft.backgroundPath).data.publicUrl : null;
  const background = preview || storedBackground || builtInBackgrounds[base] || null;
  const selectedImagePath = isImageCardSlot(slot) ? draft[`${slot}Path`] : null;
  const storedCardImage = selectedImagePath && supabase ? supabase.storage.from('app-assets').getPublicUrl(selectedImagePath).data.publicUrl : null;
  const cardImage = cardImagePreview || storedCardImage;
  const imageLayout = normalizeThemeCardImageLayout(isImageCardSlot(slot) ? draft[`${slot}ImageLayout`] : undefined);

  function setCard(next: typeof card) {
    setDraft(current => ({ ...current, cards: { ...current.cards, [slot]: next } }));
    setSaved(false);
  }
  function resetCard() {
    setDraft(current => { const cards = { ...current.cards }; delete cards[slot]; return { ...current, cards }; });
    setSaved(false);
  }
  function setImageLayout(next: typeof defaultThemeCardImageLayout) {
    if (!isImageCardSlot(slot)) return;
    const key = `${slot}ImageLayout` as `${ImageCardSlot}ImageLayout`;
    setDraft(current => ({ ...current, [key]: next }));
    setSaved(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSaved(false);
    if (demo || !supabase) return;
    const name = draft.name?.trim();
    if (isCustomTheme(theme) && (!name || name.length > 40)) { setError('Escribí un nombre de entre 1 y 40 caracteres.'); return; }
    setBusy(true);
    try {
      let backgroundPath = draft.backgroundPath ?? null;
      if (file) {
        const extension = await bannerImageExtension(file);
        let bitmap: ImageBitmap;
        try { bitmap = await createImageBitmap(file); }
        catch { throw new InputError('No pudimos leer el fondo. Elegí una imagen válida.'); }
        const tooLarge = bitmap.width * bitmap.height > 20_000_000;
        bitmap.close();
        if (tooLarge) throw new InputError('Reducí el fondo a 20 megapíxeles o menos.');
        backgroundPath = `theme-backgrounds/${crypto.randomUUID()}.${extension}`;
        const uploaded = await supabase.storage.from('app-assets').upload(backgroundPath, file, { contentType: file.type, upsert: false });
        if (uploaded.error) throw new InputError('No pudimos subir el fondo. Revisá la migración 053 y los permisos.');
      }
      const nextDesign: ThemeDesign = { ...draft, name, backgroundPath };
      for (const imageSlot of imageCardSlots) {
        const imageFile = cardImageFiles[imageSlot];
        if (!imageFile) continue;
        const extension = await bannerImageExtension(imageFile);
        const imagePath = `theme-card-images/${theme}/${imageSlot}-${crypto.randomUUID()}.${extension}`;
        const uploaded = await supabase.storage.from('app-assets').upload(imagePath, imageFile, { contentType: imageFile.type, upsert: false });
        if (uploaded.error) throw new InputError(`No pudimos subir la imagen de ${cardSlots.find(item => item.id === imageSlot)?.label ?? imageSlot}. Revisá la migración 053 y los permisos.`);
        nextDesign[`${imageSlot}Path`] = imagePath;
      }
      const next = { ...designs, [theme]: nextDesign };
      const result = await supabase.from('app_settings').update({ portal_theme_designs: next }).eq('id', true).select('portal_theme_designs').single();
      if (result.error) throw new InputError('No pudimos guardar el diseño. Revisá la migración 053 y tus permisos.');
      onSaved(next); setDraft(nextDesign); setFile(null); setCardImageFiles({}); if (input.current) input.current.value = '';
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar el diseño.'); }
    finally { setBusy(false); }
  }

  return <section className="theme-design-editor" aria-labelledby="theme-design-title">
    <div className="theme-editor-heading"><div><span className="eyebrow">02 · DISEÑO MANUAL</span><h2 id="theme-design-title">Fondo y tarjetas</h2><p>Los cambios se guardan solo para este tema. Podés probarlos en la vista previa.</p></div></div>
    {error && <p className="alert error" role="alert">{error}</p>}
    <form onSubmit={event => void save(event)}>
      {isCustomTheme(theme) && <label>Nombre del tema<input type="text" value={draft.name ?? ''} maxLength={40} disabled={busy || demo} onChange={event => { setDraft(current => ({ ...current, name: event.target.value })); setSaved(false); }} required /></label>}
      <div className="theme-design-grid">
        <div className="theme-design-fields">
          <h3>Fondo del portal</h3>
          <label className="theme-design-file"><ImagePlus size={17} /> Imagen de fondo<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || demo} onChange={event => { setFile(event.target.files?.[0] ?? null); setSaved(false); }} /><small>JPG, PNG o WebP · hasta 5 MB. Se aplica al inicio, acceso y otras pantallas.</small></label>
          {(draft.backgroundPath || file) && <button className="theme-design-reset" type="button" disabled={busy || demo} onClick={() => { setDraft(current => ({ ...current, backgroundPath: null })); setFile(null); if (input.current) input.current.value = ''; setSaved(false); }}><RotateCcw size={15} /> Usar fondo original</button>}
          <label>Posición horizontal <output>{draft.backgroundX ?? 50}%</output><input type="range" min="0" max="100" value={draft.backgroundX ?? 50} disabled={busy || demo} onChange={event => setDraft(current => ({ ...current, backgroundX: Number(event.target.value) }))} /></label>
          <label>Posición vertical <output>{draft.backgroundY ?? 0}%</output><input type="range" min="0" max="100" value={draft.backgroundY ?? 0} disabled={busy || demo} onChange={event => setDraft(current => ({ ...current, backgroundY: Number(event.target.value) }))} /></label>
          <label>Tamaño del fondo <output>{draft.backgroundScale ?? 100}%</output><input type="range" min="50" max="200" value={draft.backgroundScale ?? 100} disabled={busy || demo} onChange={event => setDraft(current => ({ ...current, backgroundScale: Number(event.target.value) }))} /></label>
        </div>
        <div className="theme-design-preview" style={background ? { backgroundImage: `url("${background}")`, backgroundPosition: `${draft.backgroundX ?? 50}% ${draft.backgroundY ?? 0}%`, backgroundSize: (draft.backgroundScale ?? 100) === 100 ? 'cover' : `${draft.backgroundScale}% auto` } : undefined}>
          <div className="theme-design-preview-header">Gana<span>777</span>bet.com</div>
          <div className="theme-design-preview-spacer" />
          <div className="theme-design-preview-card" style={{ position: 'relative', overflow: 'hidden', background: card.background, border: `${card.borderWidth}px solid ${card.borderColor}`, borderRadius: card.radius, aspectRatio: isImageCardSlot(slot) ? '12 / 5' : undefined, minHeight: cardImage ? 0 : undefined }}>{cardImage ? <img src={cardImage} alt="" className="theme-design-preview-image" style={{ left: `calc(50% + ${imageLayout.x}%)`, top: `calc(50% + ${imageLayout.y}%)`, width: `${imageLayout.width}%`, height: `${imageLayout.height}%` } as CSSProperties} /> : <><strong>{cardSlots.find(item => item.id === slot)?.label}</strong><small>Vista previa de la tarjeta seleccionada</small></>}</div>
        </div>
      </div>
      <div className="theme-card-editor">
        <h3>Colores y bordes de cada tarjeta</h3>
        <div className="theme-card-slots" role="group" aria-label="Tarjeta para editar">{cardSlots.map(item => <button key={item.id} type="button" className={slot === item.id ? 'active' : ''} aria-pressed={slot === item.id} onClick={() => setSlot(item.id)}>{item.label}{draft.cards?.[item.id] ? ' ●' : ''}</button>)}</div>
        <div className="theme-card-controls">
          <label>Color de fondo <input type="color" value={card.background} disabled={busy || demo} onChange={event => setCard({ ...card, background: event.target.value })} /></label>
          <label>Color del borde <input type="color" value={card.borderColor} disabled={busy || demo} onChange={event => setCard({ ...card, borderColor: event.target.value })} /></label>
          <label>Grosor del borde <output>{card.borderWidth}px</output><input type="range" min="0" max="8" value={card.borderWidth} disabled={busy || demo} onChange={event => setCard({ ...card, borderWidth: Number(event.target.value) })} /></label>
          <label>Redondeo <output>{card.radius}px</output><input type="range" min="0" max="40" value={card.radius} disabled={busy || demo} onChange={event => setCard({ ...card, radius: Number(event.target.value) })} /></label>
        </div>
        {isImageCardSlot(slot) && <div className="theme-card-image-editor">
          <h4>Imagen de {cardSlots.find(item => item.id === slot)?.label ?? slot}</h4>
          <label className="theme-design-file"><ImagePlus size={17} />{selectedImagePath || selectedCardImageFile ? 'Cambiar imagen' : 'Subir imagen'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || demo} onChange={event => { const nextFile = event.target.files?.[0]; if (nextFile) setCardImageFiles(current => ({ ...current, [slot]: nextFile })); setSaved(false); event.currentTarget.value = ''; }} /><small>JPG, PNG o WebP · hasta 5 MB. Tamaño recomendado: 720 × 300 px (relación 12:5). Se recorta para llenar la tarjeta sin deformarse.</small></label>
          <div className="theme-card-live-preview">
            <strong>Vista previa en vivo</strong>
            <div className="theme-card-live-preview-frame" style={{ border: `${card.borderWidth}px solid ${card.borderColor}`, borderRadius: card.radius }}>
              {cardImage ? <img src={cardImage} alt="" style={{ left: `calc(50% + ${imageLayout.x}%)`, top: `calc(50% + ${imageLayout.y}%)`, width: `${imageLayout.width}%`, height: `${imageLayout.height}%` } as CSSProperties} /> : <span>Subí una imagen para ver cómo queda la tarjeta</span>}
            </div>
          </div>
          {(selectedImagePath || selectedCardImageFile) && <div className="theme-card-controls theme-card-image-layout">
            <label>Posición horizontal <output>{imageLayout.x}%</output><input type="range" min="-100" max="100" value={imageLayout.x} disabled={busy || demo} onChange={event => setImageLayout({ ...imageLayout, x: Number(event.target.value) })} /></label>
            <label>Posición vertical <output>{imageLayout.y}%</output><input type="range" min="-100" max="100" value={imageLayout.y} disabled={busy || demo} onChange={event => setImageLayout({ ...imageLayout, y: Number(event.target.value) })} /></label>
            <label>Ancho de imagen <output>{imageLayout.width}%</output><input type="range" min="50" max="300" value={imageLayout.width} disabled={busy || demo} onChange={event => setImageLayout({ ...imageLayout, width: Number(event.target.value) })} /></label>
            <label>Alto de imagen <output>{imageLayout.height}%</output><input type="range" min="50" max="300" value={imageLayout.height} disabled={busy || demo} onChange={event => setImageLayout({ ...imageLayout, height: Number(event.target.value) })} /></label>
            <button className="theme-design-reset" type="button" disabled={busy || demo} onClick={() => setImageLayout(defaultThemeCardImageLayout)}><RotateCcw size={15} /> Centrar y ajustar a tarjeta</button>
          </div>}
          {(selectedImagePath || selectedCardImageFile) && <button className="theme-design-reset" type="button" disabled={busy || demo} onClick={() => { setDraft(current => ({ ...current, [`${slot}Path`]: null })); setCardImageFiles(current => ({ ...current, [slot]: undefined })); setSaved(false); }}><RotateCcw size={15} /> Quitar imagen y usar estilo del tema</button>}
        </div>}
        {selected && <button className="theme-design-reset" type="button" disabled={busy || demo} onClick={resetCard}><RotateCcw size={15} /> Usar estilo original de esta tarjeta</button>}
      </div>
      <div className="theme-banner-actions"><button className="primary" type="submit" disabled={busy || demo}>{busy ? 'Guardando…' : 'Guardar fondo y tarjetas'}</button>{saved && <small role="status">Diseño guardado para este tema.</small>}</div>
    </form>
  </section>;
}
