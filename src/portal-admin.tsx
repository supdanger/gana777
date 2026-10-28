import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, ImagePlus } from 'lucide-react';
import { InputError } from '../supabase/functions/_shared/validation';
import { StorageImage, useContent } from './content';
import { bannerImageExtension, defaultHomeBanner, defaultHomeBannerLayoutForTheme, homeBannerColumns, normalizeHomeBannerLayout, parseHomeBanner, type HomeBannerLayout, type HomeBannerTheme } from './home-banner';
import { BannerLayoutEditor } from './banner-layout-editor';
import { PortalHeaderLogoAdmin } from './portal-header-logo-admin';
import { supabase } from './lib';
import { safeHttpsLink } from './security';
import casinoBanner from './assets/home-casino-banner-v3.png';
import { isCustomTheme, themeBase, type ThemeDesigns } from './portal-theme-design';

type SeasonalBannerField = 'home_banner_dark_path' | 'home_banner_christmas_path' | 'home_banner_new_year_path' | 'home_banner_halloween_path';
const seasonalBanners: { field: SeasonalBannerField; label: string; theme: 'dark' | 'christmas' | 'new-year' | 'halloween' }[] = [
  { field: 'home_banner_dark_path', label: 'Oscuro', theme: 'dark' },
  { field: 'home_banner_christmas_path', label: 'Navidad', theme: 'christmas' },
  { field: 'home_banner_new_year_path', label: 'Año Nuevo', theme: 'new-year' },
  { field: 'home_banner_halloween_path', label: 'Halloween', theme: 'halloween' },
];
const bannerThemes: HomeBannerTheme[] = ['base', 'dark', 'christmas', 'new-year', 'halloween'];
type BannerLayouts = Record<string, HomeBannerLayout>;
const initialLayouts = (): BannerLayouts => ({ base: defaultHomeBannerLayoutForTheme('base'), dark: defaultHomeBannerLayoutForTheme('dark'), christmas: defaultHomeBannerLayoutForTheme('christmas'), 'new-year': defaultHomeBannerLayoutForTheme('new-year'), halloween: defaultHomeBannerLayoutForTheme('halloween') });

export function PortalAdmin({ demo, busy, action, canEditThemes }: { demo: boolean; busy: boolean; canEditThemes: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const { settings, reloadPromotions: reloadContent } = useContent();
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState(defaultHomeBanner.home_banner_title);
  const [url, setUrl] = useState('');
  const [path, setPath] = useState<string | null>(null);
  const [themePaths, setThemePaths] = useState<Record<SeasonalBannerField, string | null>>({
    home_banner_dark_path: null, home_banner_christmas_path: null, home_banner_new_year_path: null, home_banner_halloween_path: null,
  });
  const [designs, setDesigns] = useState<ThemeDesigns>(settings.portal_theme_designs ?? {});
  const [layouts, setLayouts] = useState<BannerLayouts>(initialLayouts);
  const [layoutSaved, setLayoutSaved] = useState<HomeBannerTheme | null>(null);
  const [allowLogout, setAllowLogout] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [useIncluded, setUseIncluded] = useState(false);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(!demo);
  const [failure, setFailure] = useState('');
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (demo || !supabase) { setLoading(false); return; }
    let alive = true;
    void supabase.from('app_settings').select(homeBannerColumns).eq('id', true).single().then(({ data, error }) => {
      if (!alive) return;
      setLoading(false);
      if (error) { setFailure('No pudimos cargar los banners. Aplicá las migraciones 048 y 049 y revisá tu conexión y permisos.'); return; }
      setEnabled(data.home_banner_enabled); setTitle(data.home_banner_title); setUrl(data.home_banner_url ?? ''); setPath(data.home_banner_path); setAllowLogout(data.allow_player_logout === true);
      setThemePaths({ home_banner_dark_path: data.home_banner_dark_path, home_banner_christmas_path: data.home_banner_christmas_path, home_banner_new_year_path: data.home_banner_new_year_path, home_banner_halloween_path: data.home_banner_halloween_path });
      setDesigns((data.portal_theme_designs ?? {}) as ThemeDesigns);
      const savedLayouts = data.home_banner_layouts as Record<string, unknown> | null;
      const allThemes = [...bannerThemes, ...Object.keys(data.portal_theme_designs ?? {}).filter(isCustomTheme)];
      setLayouts(Object.fromEntries(allThemes.map(theme => [theme, normalizeHomeBannerLayout(savedLayouts?.[theme], defaultHomeBannerLayoutForTheme((data.portal_theme_designs as ThemeDesigns | null)?.[theme]?.baseTheme ?? theme))])));
    });
    return () => { alive = false; };
  }, [demo]);
  useEffect(() => setDesigns(settings.portal_theme_designs ?? {}), [settings.portal_theme_designs]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no guarda el banner.');
      let nextPath = path;
      let image = file;
      if (!image && (useIncluded || !path)) {
        const response = await fetch(casinoBanner);
        if (!response.ok) throw new InputError('No pudimos cargar el banner incluido. Recargá el panel y volvé a intentar.');
        image = new File([await response.blob()], 'ir-al-casino.png', { type: 'image/png' });
      }
      // Validate everything before uploading; no changes to the current banner on failure.
      const extension = image ? await bannerImageExtension(image) : null;
      if (extension) nextPath = `home-banners/${crypto.randomUUID()}.${extension}`;
      const { home_banner_enabled, home_banner_title, home_banner_url, home_banner_path } = parseHomeBanner(enabled, title, url, nextPath);
      const payload = { home_banner_enabled, home_banner_title, home_banner_url, home_banner_path, home_banner_layouts: layouts, allow_player_logout: allowLogout };
      if (image && nextPath) {
        let bitmap: ImageBitmap;
        try { bitmap = await createImageBitmap(image); }
        catch { throw new InputError('No pudimos leer la imagen. Probá con otro archivo JPG, PNG o WebP.'); }
        const tooLarge = bitmap.width * bitmap.height > 20_000_000;
        bitmap.close();
        if (tooLarge) throw new InputError('La imagen es demasiado grande. Reducila a un máximo de 20 megapíxeles.');
        const uploaded = await supabase.storage.from('app-assets').upload(nextPath, image, { contentType: image.type, upsert: false });
        if (uploaded.error) throw new InputError('No pudimos subir el banner. Revisá los permisos y la migración 023.');
      }
      const result = await supabase.from('app_settings').update(payload).eq('id', true).select(homeBannerColumns).single();
      if (result.error) throw new InputError('No se pudo confirmar el guardado. Revisá la conexión, la migración 023 y tus permisos antes de reintentar.');
      setPath(result.data.home_banner_path); setFile(null); setUseIncluded(false);
      if (fileInput.current) fileInput.current.value = '';
      setSaved(true); reloadContent();
    });
  }

  function changeLayout(theme: HomeBannerTheme, next: HomeBannerLayout) {
    setLayouts(current => ({ ...current, [theme]: normalizeHomeBannerLayout(next, defaultHomeBannerLayoutForTheme(designs[theme]?.baseTheme ?? theme)) }));
    setLayoutSaved(null);
  }

  async function saveLayout(theme: HomeBannerTheme) {
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no guarda el encuadre.');
      const result = await supabase.from('app_settings').update({ home_banner_layouts: layouts }).eq('id', true).select('home_banner_layouts').single();
      if (result.error) throw new InputError('No pudimos guardar el encuadre. Revisá la migración 049 y tus permisos.');
      setLayoutSaved(theme);
      reloadContent();
    });
  }

  const safeUrl = safeHttpsLink(url);
  return <section className="portal-admin">
    <div className="account-heading"><div><h1>Portal de jugadores</h1><p>Configurá el botón con banner que aparece antes de Cargar en el inicio.</p></div></div>
    {failure ? <p className="empty" role="alert">{failure}</p> : <form className="portal-banner-form" onSubmit={save}>
      <fieldset disabled={busy || loading || demo}>
        <legend><ImagePlus size={21} /> Botón del inicio</legend>
        <label className="portal-banner-toggle"><input type="checkbox" checked={allowLogout} onChange={event => { setAllowLogout(event.target.checked); setSaved(false); }} />Permitir que los jugadores cierren sesión desde su perfil</label>
        <label className="portal-banner-toggle"><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setSaved(false); }} />Mostrar en el portal</label>
        <label>Nombre del botón<input value={title} onChange={event => { setTitle(event.target.value); setSaved(false); }} maxLength={80} required /><small>Identifica la imagen para accesibilidad y si no carga.</small></label>
        <label>Página de destino predeterminada<input type="url" value={url} onChange={event => { setUrl(event.target.value); setSaved(false); }} placeholder="https://ejemplo.com" maxLength={2048} required={enabled} /><small>Se usa para jugadores sin enlace personal. Los enlaces asignados desde Solicitudes tienen prioridad.</small></label>
        <label>Imagen del tema Base<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { setFile(event.target.files?.[0] ?? null); setUseIncluded(false); setSaved(false); }} /><small>Esta imagen también se usa en otros temas que no tengan una propia. JPG, PNG o WebP · Hasta 5 MB.</small></label>
        <BannerLayoutEditor label="Base" layout={layouts.base} previewLayout={{ ...layouts.base, height: layouts.base.height * 2 }} heightScale={2} defaults={defaultHomeBannerLayoutForTheme('base')} heightRange={[20, 70]} disabled={busy || loading || demo} saved={layoutSaved === 'base'} onChange={next => changeLayout('base', next)} onSave={() => void saveLayout('base')}>
          {preview ? <img src={preview} alt={title} /> : path && !useIncluded ? <StorageImage path={path} alt={title} /> : <img src={casinoBanner} alt="Gana777bet.com · Ir al casino" />}
        </BannerLayoutEditor>
        <button type="button" onClick={() => { setFile(null); setUseIncluded(true); setSaved(false); if (fileInput.current) fileInput.current.value = ''; }}>Usar banner incluido «Ir al casino»</button>
        <div className="portal-banner-actions"><button type="submit">{loading ? 'Cargando…' : 'Guardar banner'}</button>{safeUrl && <a href={safeUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Probar enlace</a>}</div>
      </fieldset>
      {saved && <p role="status">Banner guardado. {enabled ? 'Ya está habilitado en el inicio.' : 'El botón está oculto.'}</p>}
    </form>}
    {!failure && <div className="portal-theme-banners" aria-label="Imágenes del botón por tema">
      <h2>Imágenes para los demás temas</h2>
      <p>El enlace y la visibilidad del botón son los mismos en todos los temas. Guardá una imagen diferente en cada espacio; las que falten usan la imagen base. El banner ahora tiene el doble de alto. Para Halloween, prepará la imagen en 1200 × 432 px (relación 25:9); en los demás temas, seguí la proporción de la vista previa.</p>
      <div className="portal-theme-banner-grid">{seasonalBanners.map(({ field, label, theme }) => <ThemeBannerSlot key={field} field={field} label={label} theme={theme} path={themePaths[field]} basePath={path} layout={layouts[theme]} layouts={layouts} layoutSaved={layoutSaved === theme} onLayoutChange={next => changeLayout(theme, next)} onLayoutSave={() => void saveLayout(theme)} demo={demo} busy={busy || loading} action={action} onSaved={nextPath => { setThemePaths(current => ({ ...current, [field]: nextPath })); reloadContent(); }} />)}
        {canEditThemes && Object.entries(designs).filter(([id]) => isCustomTheme(id)).map(([id, design]) => <ThemeBannerSlot key={id} theme={id as HomeBannerTheme} label={design.name || 'Tema personalizado'} path={design.casinoPath ?? null} basePath={path} fallbackTheme={themeBase({ portal_theme: id as HomeBannerTheme, portal_theme_designs: designs })} layout={layouts[id] ?? defaultHomeBannerLayoutForTheme(design.baseTheme ?? 'base')} layouts={layouts} layoutSaved={layoutSaved === id} onLayoutChange={next => changeLayout(id as HomeBannerTheme, next)} onLayoutSave={() => void saveLayout(id as HomeBannerTheme)} demo={demo} busy={busy || loading} action={action} designs={designs} onSaved={nextPath => { setDesigns(current => ({ ...current, [id]: { ...current[id], casinoPath: nextPath } })); reloadContent(); }} />)}</div>
    </div>}
    <PortalHeaderLogoAdmin demo={demo} busy={busy} action={action} canEditThemes={canEditThemes} />
    <p className="portal-banner-permissions">Disponible para superadministradores y cajeros con permiso de Contactos.</p>
  </section>;
}

function ThemeBannerSlot({ field, label, theme, path, basePath, fallbackTheme, layout, layouts, layoutSaved, onLayoutChange, onLayoutSave, demo, busy, action, designs, onSaved }: {
  field?: SeasonalBannerField; label: string; theme: HomeBannerTheme; fallbackTheme?: HomeBannerTheme;
  path: string | null; basePath: string | null; layout: HomeBannerLayout; layouts: BannerLayouts; layoutSaved: boolean;
  onLayoutChange: (layout: HomeBannerLayout) => void; onLayoutSave: () => void;
  demo: boolean; busy: boolean;
  designs?: ThemeDesigns;
  action: (task: () => Promise<void>) => Promise<void>; onSaved: (path: string | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setSaved(false);
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no guarda el banner.');
      const extension = await bannerImageExtension(file);
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(file); }
      catch { throw new InputError('No pudimos leer la imagen. Probá con otro archivo JPG, PNG o WebP.'); }
      const tooLarge = bitmap.width * bitmap.height > 20_000_000;
      bitmap.close();
      if (tooLarge) throw new InputError('La imagen es demasiado grande. Reducila a un máximo de 20 megapíxeles.');
      const nextPath = `home-banners/${crypto.randomUUID()}.${extension}`;
      const uploaded = await supabase.storage.from('app-assets').upload(nextPath, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw new InputError('No pudimos subir la imagen del tema. Revisá los permisos.');
      const payload = field ? { [field]: nextPath, home_banner_layouts: layouts } : { portal_theme_designs: { ...designs, [theme]: { ...designs?.[theme], casinoPath: nextPath } }, home_banner_layouts: layouts };
      const result = await supabase.from('app_settings').update(payload).eq('id', true).select(field ?? 'portal_theme_designs').single();
      if (result.error) throw new InputError('No pudimos guardar la imagen del tema. Revisá la migración 048 y tus permisos.');
      onSaved(nextPath);
      setFile(null); if (input.current) input.current.value = '';
      setSaved(true);
    });
  }

  async function restore() {
    setSaved(false);
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no guarda el banner.');
      const payload = field ? { [field]: null } : { portal_theme_designs: { ...designs, [theme]: { ...designs?.[theme], casinoPath: null } } };
      const result = await supabase.from('app_settings').update(payload).eq('id', true).select(field ?? 'portal_theme_designs').single();
      if (result.error) throw new InputError('No pudimos restaurar la imagen del tema. Revisá la migración 048.');
      onSaved(null);
      setFile(null); if (input.current) input.current.value = '';
      setSaved(true);
    });
  }

  return <form className="portal-theme-banner-slot" onSubmit={event => void save(event)}>
    <h3>{label}</h3>
    <BannerLayoutEditor label={label} layout={layout} previewLayout={{ ...layout, height: layout.height * 2 }} heightScale={2} defaults={defaultHomeBannerLayoutForTheme(fallbackTheme ?? theme)} heightRange={[20, 70]} disabled={busy || demo} saved={layoutSaved} onChange={onLayoutChange} onSave={onLayoutSave}>
      {preview ? <img src={preview} alt={`Nueva imagen para ${label}`} /> : path ? <StorageImage path={path} alt={`Banner de ${label}`} /> : (fallbackTheme ?? theme) === 'christmas' ? <img src="/preview-assets/christmas-casino-banner.webp" alt="Banner navideño incluido" /> : (fallbackTheme ?? theme) === 'halloween' ? <img src="/preview-assets/halloween-casino-banner.webp" alt="Banner de Halloween incluido" /> : basePath ? <StorageImage path={basePath} alt="Imagen base" /> : <img src={casinoBanner} alt="Imagen base incluida" />}
    </BannerLayoutEditor>
    <p>{path ? 'Imagen propia guardada.' : (fallbackTheme ?? theme) === 'christmas' || (fallbackTheme ?? theme) === 'halloween' ? 'Usa el banner del tema incluido.' : 'Usa la imagen del tema Base.'}</p>
    <label>Imagen para {label}<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || demo} onChange={event => { setFile(event.target.files?.[0] ?? null); setSaved(false); }} /></label>
    <div className="portal-banner-actions"><button type="submit" disabled={busy || demo || !file}>Guardar imagen</button>{path && <button type="button" disabled={busy || demo} onClick={() => void restore()}>{theme === 'christmas' || theme === 'halloween' ? 'Usar imagen incluida' : 'Usar imagen base'}</button>}</div>
    {saved && <small role="status">Imagen de {label} actualizada.</small>}
  </form>;
}
