import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ImagePlus, Moon, Palette, Sparkles, Snowflake, Video, Ghost } from 'lucide-react';
import { supabase } from './lib';
import { StorageImage, useContent, type PortalTheme } from './content';
import { BannerLayoutEditor } from './banner-layout-editor';
import { defaultBonusBannerLayout, normalizeBonusBannerLayout } from './bonus-banner-layout';
import type { HomeBannerLayout } from './home-banner';
import { builtInThemes, isCustomTheme, type BuiltInTheme, type ThemeDesigns } from './portal-theme-design';
import { ThemeDesignAdmin } from './theme-design-admin';
import { PortalBannersAdmin } from './portal-banners-admin';

const maxMediaSize = 20 * 1024 * 1024;
const mediaTypes: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm',
};
const themes = [
  { id: 'base', name: 'Base', description: 'Azul profundo y celeste', Icon: Palette },
  { id: 'dark', name: 'Oscuro', description: 'Grafito y azul tenue', Icon: Moon },
  { id: 'christmas', name: 'Navidad', description: 'Verde, rojo y dorado', Icon: Snowflake },
  { id: 'new-year', name: 'Año Nuevo', description: 'Medianoche y dorado', Icon: Sparkles },
  { id: 'halloween', name: 'Halloween', description: 'Bosque oscuro y violeta', Icon: Ghost },
] as const;
type BonusLayouts = Record<string, HomeBannerLayout>;
function bonusDefault(theme: PortalTheme, designs: ThemeDesigns): HomeBannerLayout {
  return defaultBonusBannerLayout(designs[theme]?.baseTheme ?? theme);
}
function loadedLayouts(saved: Record<string, unknown>, ids: PortalTheme[], designs: ThemeDesigns): BonusLayouts {
  return Object.fromEntries(ids.map(theme => [theme, normalizeBonusBannerLayout(saved?.[theme], designs[theme]?.baseTheme ?? theme)]));
}

export function ThemesAdmin({ demo }: { demo: boolean }) {
  const { settings, reloadPromotions: reloadContent } = useContent();
  const [path, setPath] = useState<string | null>(settings.home_bonus_media_path);
  const [halloweenPath, setHalloweenPath] = useState<string | null>(settings.home_bonus_halloween_media_path);
  const [designs, setDesigns] = useState<ThemeDesigns>(settings.portal_theme_designs ?? {});
  const [theme, setTheme] = useState<PortalTheme>(settings.portal_theme);
  const [layouts, setLayouts] = useState<BonusLayouts>(() => loadedLayouts(settings.home_bonus_layouts, [...builtInThemes, ...Object.keys(settings.portal_theme_designs ?? {}).filter(isCustomTheme) as PortalTheme[]], settings.portal_theme_designs ?? {}));
  const [layoutSaved, setLayoutSaved] = useState<PortalTheme | null>(null);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeError, setThemeError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState('');
  const [newBase, setNewBase] = useState<BuiltInTheme>('base');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const allThemes = [...themes, ...Object.entries(designs).filter(([id]) => isCustomTheme(id)).map(([id, design]) => ({ id: id as PortalTheme, name: design.name || 'Tema nuevo', description: `Basado en ${themes.find(item => item.id === design.baseTheme)?.name ?? 'Base'}`, Icon: Palette }))];

  useEffect(() => setPath(settings.home_bonus_media_path), [settings.home_bonus_media_path]);
  useEffect(() => setHalloweenPath(settings.home_bonus_halloween_media_path), [settings.home_bonus_halloween_media_path]);
  useEffect(() => setDesigns(settings.portal_theme_designs ?? {}), [settings.portal_theme_designs]);
  useEffect(() => setTheme(settings.portal_theme), [settings.portal_theme]);
  useEffect(() => setLayouts(loadedLayouts(settings.home_bonus_layouts, [...builtInThemes, ...Object.keys(settings.portal_theme_designs ?? {}).filter(isCustomTheme) as PortalTheme[]], settings.portal_theme_designs ?? {})), [settings.home_bonus_layouts, settings.portal_theme_designs]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function selectTheme(next: PortalTheme) {
    if (themeBusy || demo || !supabase) return;
    if (next === settings.portal_theme) { setTheme(next); return; }
    setFile(null); if (input.current) input.current.value = '';
    setThemeError(''); setThemeBusy(true);
    const result = await supabase.from('app_settings').update({ portal_theme: next }).eq('id', true).select('portal_theme').single();
    setThemeBusy(false);
    if (result.error || !allThemes.some(option => option.id === result.data?.portal_theme)) {
      setThemeError('No pudimos cambiar el tema. Revisá la conexión y la migración 052.');
      return;
    }
    setTheme(result.data!.portal_theme as PortalTheme);
    reloadContent();
  }

  async function createTheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreateError('');
    if (demo || !supabase) return;
    const name = newName.trim();
    if (!name || name.length > 40) { setCreateError('Escribí un nombre de entre 1 y 40 caracteres.'); return; }
    const id = `custom-${crypto.randomUUID()}` as PortalTheme;
    const next = { ...designs, [id]: { name, baseTheme: newBase } };
    setCreateBusy(true);
    const result = await supabase.from('app_settings').update({ portal_theme_designs: next }).eq('id', true).select('portal_theme_designs').single();
    setCreateBusy(false);
    if (result.error) { setCreateError('No pudimos crear el tema. Revisá la migración 053 y tus permisos.'); return; }
    setDesigns(next); setNewName(''); setTheme(id);
    setLayouts(current => ({ ...current, [id]: defaultBonusBannerLayout(newBase) }));
    reloadContent();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setNotice('');
    if (demo || !supabase || !file) return;
    const extension = mediaTypes[file.type];
    if (!extension || file.size === 0 || file.size > maxMediaSize) {
      setError('Elegí una imagen JPG, PNG o WebP, o un video MP4 o WebM de hasta 20 MB.');
      return;
    }
    setBusy(true);
    const nextPath = `home-bonus/${crypto.randomUUID()}.${extension}`;
    try {
      const uploaded = await supabase.storage.from('app-assets').upload(nextPath, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw new Error('No pudimos subir el archivo. Revisá la conexión y volvé a intentar.');
      const custom = isCustomTheme(theme);
      const field = theme === 'halloween' ? 'home_bonus_halloween_media_path' : 'home_bonus_media_path';
      const nextDesigns = custom ? { ...designs, [theme]: { ...designs[theme], bonusPath: nextPath } } : designs;
      const result = await supabase.from('app_settings').update(custom ? { portal_theme_designs: nextDesigns, home_bonus_layouts: layouts } : { [field]: nextPath, home_bonus_layouts: layouts }).eq('id', true).select(custom ? 'portal_theme_designs' : field).single();
      if (result.error) throw new Error('El archivo se subió, pero no pudimos activar el banner. Revisá las migraciones 050 y 052.');
      if (custom) setDesigns(nextDesigns); else if (theme === 'halloween') setHalloweenPath(nextPath); else setPath(nextPath);
      setFile(null);
      if (input.current) input.current.value = '';
      setNotice('Banner de bonos actualizado. Ya aparece en el inicio.');
      reloadContent();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar el banner.'); }
    finally { setBusy(false); }
  }

  function changeLayout(next: HomeBannerLayout) {
    setLayouts(current => ({ ...current, [theme]: normalizeBonusBannerLayout(next, designs[theme]?.baseTheme ?? theme) }));
    setLayoutSaved(null); setNotice('');
  }

  async function saveLayout() {
    setError(''); setNotice('');
    if (demo || !supabase) return;
    setBusy(true);
    const result = await supabase.from('app_settings').update({ home_bonus_layouts: layouts }).eq('id', true).select('home_bonus_layouts').single();
    setBusy(false);
    if (result.error) { setError('No pudimos guardar el encuadre. Revisá la migración 050 y tus permisos.'); return; }
    setLayoutSaved(theme);
    reloadContent();
  }

  async function restore() {
    setError(''); setNotice('');
    if (demo || !supabase) return;
    setBusy(true);
    const custom = isCustomTheme(theme);
    const field = theme === 'halloween' ? 'home_bonus_halloween_media_path' : 'home_bonus_media_path';
    const nextDesigns = custom ? { ...designs, [theme]: { ...designs[theme], bonusPath: null } } : designs;
    const result = await supabase.from('app_settings').update(custom ? { portal_theme_designs: nextDesigns } : { [field]: null }).eq('id', true).select(custom ? 'portal_theme_designs' : field).single();
    setBusy(false);
    if (result.error) { setError('No pudimos restaurar el banner incluido.'); return; }
    if (custom) setDesigns(nextDesigns); else if (theme === 'halloween') setHalloweenPath(null); else setPath(null);
    setFile(null);
    if (input.current) input.current.value = '';
    setNotice('Restauramos el banner de bonos incluido.');
    reloadContent();
  }

  const currentPath = isCustomTheme(theme) ? designs[theme]?.bonusPath ?? null : theme === 'halloween' ? halloweenPath : path;
  const currentVideo = currentPath ? /\.(mp4|webm)$/i.test(currentPath) : false;
  const previewVideo = file ? file.type.startsWith('video/') : currentVideo;
  const source = preview || (currentPath && supabase ? supabase.storage.from('app-assets').getPublicUrl(currentPath).data.publicUrl : '');
  return <div className="themes-admin">
    <div className="page-title"><div><span className="eyebrow">APARIENCIA DEL PORTAL</span><h1>Temas</h1><p>El tema elegido se aplica al inicio, al acceso y a las demás pantallas de los jugadores.</p></div></div>
    <section className="theme-section" aria-labelledby="available-themes-title">
      <div className="theme-section-heading"><div><span className="eyebrow">01 · APARIENCIA</span><h2 id="available-themes-title">Tema del portal</h2><p>Elegí el estilo que verán todos los jugadores.</p></div><span className="theme-current-label">Actual: {allThemes.find(option => option.id === settings.portal_theme)?.name}</span></div>
      {themeError && <p className="alert error" role="alert">{themeError}</p>}
      <div className="theme-presets" role="group" aria-label="Temas disponibles">
        {allThemes.map(({ id, name, description, Icon }) => <button key={id} type="button" className={`theme-preset ${isCustomTheme(id) ? 'theme-preset-custom' : `theme-preset-${id}`} ${theme === id ? 'active' : ''}`} aria-pressed={theme === id} disabled={themeBusy || demo} onClick={() => void selectTheme(id)}><span className={`theme-swatch ${isCustomTheme(id) ? 'custom' : id}`}><Icon /></span><span className="theme-preset-copy"><strong>{name}</strong><small>{description}</small></span><span className="theme-preset-status">{settings.portal_theme === id ? <><Check size={14} /> Activo</> : 'Aplicar'}</span></button>)}
      </div>
      <form className="theme-create" onSubmit={event => void createTheme(event)}>
        <label>Nombre del nuevo tema<input value={newName} maxLength={40} disabled={createBusy || demo} onChange={event => setNewName(event.target.value)} placeholder="Ej.: Carnaval" required /></label>
        <label>Estilo inicial<select value={newBase} disabled={createBusy || demo} onChange={event => setNewBase(event.target.value as BuiltInTheme)}>{themes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button type="submit" disabled={createBusy || demo || !newName.trim()}>{createBusy ? 'Creando…' : 'Crear tema'}</button>
      </form>
      {createError && <p className="alert error" role="alert">{createError}</p>}
    </section>
    <ThemeDesignAdmin theme={theme} designs={designs} demo={demo} onSaved={next => { setDesigns(next); reloadContent(); }} />
    <section className="theme-banner-editor">
      <div className="theme-editor-heading"><div><span className="eyebrow">03 · CONTENIDO DEL INICIO</span><h2>Banner de bonos</h2><p>{theme === 'dark' ? 'El tema Oscuro reproduce su banner en un loop corto y sin sonido.' : 'Usá una imagen o un video para el banner de bonos. «Ir al casino» conserva su banner.'}</p></div></div>
      {error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert" role="status">{notice}</p>}
      <BannerLayoutEditor label={`Bonos · ${allThemes.find(option => option.id === theme)?.name ?? theme}`} layout={layouts[theme] ?? bonusDefault(theme, designs)} defaults={bonusDefault(theme, designs)} heightRange={[25, 80]} disabled={busy || themeBusy || demo} saved={layoutSaved === theme} onChange={changeLayout} onSave={() => void saveLayout()}>
        {theme === 'dark' ? <video src="/preview-assets/dark-bonus-banner.mp4" poster="/preview-assets/dark-bonus-banner-card.png" autoPlay muted loop playsInline preload="metadata" aria-label="Banner de bonos del tema Oscuro" /> : source ? previewVideo ? <video key={source} src={source} autoPlay muted loop playsInline preload="metadata" /> : preview ? <img src={source} alt="Vista previa del nuevo banner" /> : currentPath ? <StorageImage path={currentPath} alt="Banner de bonos actual" /> : null : <img src={theme === 'christmas' ? '/preview-assets/christmas-bonus-banner.webp' : theme === 'halloween' ? '/preview-assets/halloween-bonus-banner.webp' : '/preview-assets/load-bonus-banner-v2.webp'} alt="Banner de bonos incluido" />}
      </BannerLayoutEditor>
      {theme === 'dark' ? <p className="theme-banner-note">El loop dura 6 segundos: el panda tira una ficha y la vuelve a agarrar. Los textos quedan quietos. El banner «Ir al casino» conserva su configuración.</p> : <form onSubmit={event => void save(event)}>
        <label htmlFor="theme-bonus-media"><ImagePlus size={17} /> Imagen o video del banner</label>
        <input id="theme-bonus-media" ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" disabled={busy || demo} onChange={event => { setFile(event.target.files?.[0] ?? null); setError(''); setNotice(''); }} />
        <small><Video size={14} /> Para encaje directo: imagen de 1200 × 522 px (relación 2,3:1). JPG, PNG, WebP, MP4 o WebM · máximo 20 MB. El video se reproduce sin sonido y en bucle.</small>
        <div className="theme-banner-actions"><button className="primary" type="submit" disabled={busy || demo || !file}>{busy ? 'Guardando…' : 'Guardar banner'}</button>{(currentPath || file) && <button type="button" disabled={busy || demo} onClick={() => void restore()}>Usar imagen incluida</button>}</div>
      </form>}
      <PortalBannersAdmin theme={theme} baseTheme={designs[theme]?.baseTheme ?? (theme === 'dark' || theme === 'christmas' || theme === 'new-year' || theme === 'halloween' ? theme : 'base')} demo={demo} />
    </section>
  </div>;
}
