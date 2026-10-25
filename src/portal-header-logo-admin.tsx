import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ImagePlus } from 'lucide-react';
import { InputError } from '../supabase/functions/_shared/validation';
import { StorageImage, useContent } from './content';
import { bannerImageExtension } from './home-banner';
import { defaultHeaderLogoLayout, headerLogoStyle, normalizeHeaderLogoLayout, type HeaderLogoLayout, type HeaderLogoTheme } from './header-logo-layout';
import { supabase } from './lib';
import { isCustomTheme, themeBase, type ThemeDesigns } from './portal-theme-design';

const themes: { id: HeaderLogoTheme; label: string }[] = [
  { id: 'base', label: 'Base' }, { id: 'dark', label: 'Oscuro' },
  { id: 'christmas', label: 'Navidad' }, { id: 'new-year', label: 'Año Nuevo' }, { id: 'halloween', label: 'Halloween' },
];
type Layouts = Record<string, HeaderLogoLayout>;
const initialLayouts = (): Layouts => ({ base: { ...defaultHeaderLogoLayout }, dark: { ...defaultHeaderLogoLayout }, christmas: { ...defaultHeaderLogoLayout }, 'new-year': { ...defaultHeaderLogoLayout }, halloween: { ...defaultHeaderLogoLayout } });
const controls: { key: keyof HeaderLogoLayout; label: string; min: number; max: number; unit: string }[] = [
  { key: 'width', label: 'Ancho', min: 60, max: 320, unit: 'px' },
  { key: 'height', label: 'Alto', min: 20, max: 140, unit: 'px' },
  { key: 'scale', label: 'Tamaño de imagen', min: 50, max: 400, unit: '%' },
  { key: 'x', label: 'Mover a los lados', min: -120, max: 120, unit: 'px' },
  { key: 'y', label: 'Mover arriba o abajo', min: -70, max: 70, unit: 'px' },
];

export function PortalHeaderLogoAdmin({ demo, busy, action, canEditThemes }: { demo: boolean; busy: boolean; canEditThemes: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const { settings, reloadPromotions: reloadContent } = useContent();
  const [path, setPath] = useState<string | null>(null);
  const [halloweenPath, setHalloweenPath] = useState<string | null>(null);
  const [designs, setDesigns] = useState<ThemeDesigns>(settings.portal_theme_designs ?? {});
  const [layouts, setLayouts] = useState<Layouts>(initialLayouts);
  const [theme, setTheme] = useState<HeaderLogoTheme>(canEditThemes || !isCustomTheme(settings.portal_theme) ? settings.portal_theme : 'base');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(!demo);
  const [failure, setFailure] = useState('');
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null);
  const allThemes = [...themes, ...(canEditThemes ? Object.entries(designs).filter(([id]) => isCustomTheme(id)).map(([id, design]) => ({ id: id as HeaderLogoTheme, label: design.name || 'Tema nuevo' })) : [])];

  useEffect(() => setTheme(canEditThemes || !isCustomTheme(settings.portal_theme) ? settings.portal_theme : 'base'), [settings.portal_theme, canEditThemes]);
  useEffect(() => setDesigns(settings.portal_theme_designs ?? {}), [settings.portal_theme_designs]);
  useEffect(() => {
    if (demo || !supabase) { setLoading(false); return; }
    let alive = true;
    void supabase.from('app_settings').select('portal_header_logo_path,portal_header_logo_halloween_path,portal_header_logo_layouts,portal_theme_designs').eq('id', true).single().then(({ data, error }) => {
      if (!alive) return;
      setLoading(false);
      if (error) { setFailure('No pudimos cargar el logo. Revisá la migración 051 y la conexión.'); return; }
      setPath(data.portal_header_logo_path);
      setHalloweenPath(data.portal_header_logo_halloween_path);
      setDesigns((data.portal_theme_designs ?? {}) as ThemeDesigns);
      const stored = data.portal_header_logo_layouts as Record<string, unknown> | null;
      const ids = [...themes.map(option => option.id), ...Object.keys(data.portal_theme_designs ?? {}).filter(isCustomTheme)];
      setLayouts(Object.fromEntries(ids.map(id => [id, normalizeHeaderLogoLayout(stored?.[id])])));
    });
    return () => { alive = false; };
  }, [demo]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function changeLayout(next: HeaderLogoLayout) {
    setLayouts(current => ({ ...current, [theme]: normalizeHeaderLogoLayout(next) }));
    setSaved(false);
  }
  function startDrag(event: PointerEvent<HTMLSpanElement>) {
    if (busy || loading || demo || event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: (layouts[theme] ?? defaultHeaderLogoLayout).x, y: (layouts[theme] ?? defaultHeaderLogoLayout).y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLSpanElement>) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    changeLayout({ ...(layouts[theme] ?? defaultHeaderLogoLayout), x: start.x + event.clientX - start.startX, y: start.y + event.clientY - start.startY });
  }
  function stopDrag(event: PointerEvent<HTMLSpanElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  async function save() {
    setSaved(false);
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no guarda el logo.');
      let nextPath = isCustomTheme(theme) ? designs[theme]?.logoPath ?? null : theme === 'halloween' ? halloweenPath : path;
      if (file) {
        const extension = await bannerImageExtension(file);
        let bitmap: ImageBitmap;
        try { bitmap = await createImageBitmap(file); }
        catch { throw new InputError('No pudimos leer la imagen. Probá con JPG, PNG o WebP.'); }
        const tooLarge = bitmap.width * bitmap.height > 20_000_000;
        bitmap.close();
        if (tooLarge) throw new InputError('La imagen es demasiado grande. Reducila a 20 megapíxeles o menos.');
        nextPath = `header-logos/${crypto.randomUUID()}.${extension}`;
        const uploaded = await supabase.storage.from('app-assets').upload(nextPath, file, { contentType: file.type, upsert: false });
        if (uploaded.error) throw new InputError('No pudimos subir el logo. Revisá los permisos y la migración 051.');
      }
      const custom = isCustomTheme(theme);
      const field = theme === 'halloween' ? 'portal_header_logo_halloween_path' : 'portal_header_logo_path';
      const nextDesigns = custom ? { ...designs, [theme]: { ...designs[theme], logoPath: nextPath } } : designs;
      const result = await supabase.from('app_settings').update(custom ? { portal_theme_designs: nextDesigns, portal_header_logo_layouts: layouts } : { [field]: nextPath, portal_header_logo_layouts: layouts }).eq('id', true).select(custom ? 'portal_theme_designs' : field).single();
      if (result.error) throw new InputError('No pudimos guardar el logo. Revisá la migración 051 y tus permisos.');
      if (custom) setDesigns(nextDesigns); else if (theme === 'halloween') setHalloweenPath(nextPath); else setPath(nextPath);
      setFile(null); if (fileInput.current) fileInput.current.value = '';
      setSaved(true); reloadContent();
    });
  }
  async function restoreText() {
    setSaved(false);
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no guarda el logo.');
      const custom = isCustomTheme(theme);
      const field = theme === 'halloween' ? 'portal_header_logo_halloween_path' : 'portal_header_logo_path';
      const nextDesigns = custom ? { ...designs, [theme]: { ...designs[theme], logoPath: null } } : designs;
      const result = await supabase.from('app_settings').update(custom ? { portal_theme_designs: nextDesigns } : { [field]: null }).eq('id', true).select(custom ? 'portal_theme_designs' : field).single();
      if (result.error) throw new InputError('No pudimos restaurar el logo de texto.');
      if (custom) setDesigns(nextDesigns); else if (theme === 'halloween') setHalloweenPath(null); else setPath(null);
      setFile(null); if (fileInput.current) fileInput.current.value = '';
      reloadContent();
    });
  }

  const layout = layouts[theme] ?? defaultHeaderLogoLayout;
  const currentPath = isCustomTheme(theme) ? designs[theme]?.logoPath ?? null : theme === 'halloween' ? halloweenPath : path;
  const halloweenStyle = themeBase({ portal_theme: theme, portal_theme_designs: designs }) === 'halloween';
  return <section className="portal-header-logo-editor" aria-labelledby="portal-header-logo-title">
    <div className="portal-logo-heading"><ImagePlus size={20} /><div><h2 id="portal-header-logo-title">Logo del encabezado</h2><p>Reemplazá el texto GANA777 del inicio por una imagen. Podés ajustar su ubicación en cada tema.</p></div></div>
    {failure ? <p role="alert" className="alert error">{failure}</p> : <>
      <div className="portal-logo-themes" role="group" aria-label="Tema para ajustar el logo">{allThemes.map(option => <button key={option.id} type="button" className={theme === option.id ? 'active' : ''} aria-pressed={theme === option.id} onClick={() => { setTheme(option.id); setFile(null); if (fileInput.current) fileInput.current.value = ''; setSaved(false); }}>{option.label}</button>)}</div>
      <div className={`portal-logo-preview theme-${themeBase({ portal_theme: theme, portal_theme_designs: designs })}`} aria-label={`Vista previa del logo en ${allThemes.find(option => option.id === theme)?.label}`}>
        <span className="portal-logo-frame" style={headerLogoStyle(layout) as CSSProperties} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
          {preview ? <img src={preview} alt="Vista previa del logo" draggable={false} /> : currentPath ? <StorageImage path={currentPath} alt="Logo actual" /> : <span className="portal-logo-text-placeholder">{halloweenStyle ? 'Gana' : 'GANA'}<span>777</span>{halloweenStyle ? 'bet.com' : null}</span>}
        </span>
        <span className="portal-logo-profile-preview">max ›</span>
      </div>
      <p className="portal-logo-hint">Arrastrá el logo en la vista previa o usá los controles.</p>
      <div className="portal-layout-sliders">{controls.map(control => <label key={control.key}><span>{control.label}<output>{layout[control.key]} {control.unit}</output></span><input type="range" min={control.min} max={control.max} step="1" value={layout[control.key]} disabled={busy || loading || demo} onChange={event => changeLayout({ ...layout, [control.key]: Number(event.target.value) })} /></label>)}</div>
      <label className="portal-logo-file">Imagen del logo<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || loading || demo} onChange={event => { setFile(event.target.files?.[0] ?? null); setSaved(false); }} /><small>JPG, PNG o WebP, hasta 5 MB. Una imagen con fondo transparente suele integrarse mejor.</small></label>
      <div className="portal-banner-actions"><button type="button" disabled={busy || loading || demo || (!currentPath && !file)} onClick={() => void save()}>Guardar logo y ajustes</button><button type="button" disabled={busy || loading || demo} onClick={() => changeLayout({ ...defaultHeaderLogoLayout })}>Restablecer ajustes</button>{(currentPath || file) && <button type="button" disabled={busy || loading || demo} onClick={() => void restoreText()}>Volver al texto GANA777</button>}</div>
      {saved && <small role="status">Logo y posición guardados.</small>}
    </>}
  </section>;
}
