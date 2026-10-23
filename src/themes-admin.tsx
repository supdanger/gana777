import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ImagePlus, Moon, Palette, Sparkles, Snowflake, Video } from 'lucide-react';
import { supabase } from './lib';
import { StorageImage, useContent, type PortalTheme } from './content';

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
] as const;

export function ThemesAdmin({ demo }: { demo: boolean }) {
  const { settings, reloadPromotions: reloadContent } = useContent();
  const [path, setPath] = useState<string | null>(settings.home_bonus_media_path);
  const [theme, setTheme] = useState<PortalTheme>(settings.portal_theme);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeError, setThemeError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setPath(settings.home_bonus_media_path), [settings.home_bonus_media_path]);
  useEffect(() => setTheme(settings.portal_theme), [settings.portal_theme]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function selectTheme(next: PortalTheme) {
    if (themeBusy || next === theme || demo || !supabase) return;
    setThemeError(''); setThemeBusy(true);
    const result = await supabase.from('app_settings').update({ portal_theme: next }).eq('id', true).select('portal_theme').single();
    setThemeBusy(false);
    if (result.error || !themes.some(option => option.id === result.data?.portal_theme)) {
      setThemeError('No pudimos cambiar el tema. Revisá la conexión y la migración 047.');
      return;
    }
    setTheme(result.data!.portal_theme as PortalTheme);
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
      const result = await supabase.from('app_settings').update({ home_bonus_media_path: nextPath }).eq('id', true).select('home_bonus_media_path').single();
      if (result.error) throw new Error('El archivo se subió, pero no pudimos activar el banner. Revisá la conexión y la migración 045.');
      setPath(result.data.home_bonus_media_path);
      setFile(null);
      if (input.current) input.current.value = '';
      setNotice('Banner de bonos actualizado. Ya aparece en el inicio.');
      reloadContent();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar el banner.'); }
    finally { setBusy(false); }
  }

  async function restore() {
    setError(''); setNotice('');
    if (demo || !supabase) return;
    setBusy(true);
    const result = await supabase.from('app_settings').update({ home_bonus_media_path: null }).eq('id', true).select('home_bonus_media_path').single();
    setBusy(false);
    if (result.error) { setError('No pudimos restaurar el banner incluido.'); return; }
    setPath(null); setFile(null);
    if (input.current) input.current.value = '';
    setNotice('Restauramos el banner de bonos incluido.');
    reloadContent();
  }

  const currentVideo = path ? /\.(mp4|webm)$/i.test(path) : false;
  const previewVideo = file ? file.type.startsWith('video/') : currentVideo;
  const source = preview || (path && supabase ? supabase.storage.from('app-assets').getPublicUrl(path).data.publicUrl : '');
  return <div className="themes-admin">
    <div className="page-title"><div><span className="eyebrow">APARIENCIA DEL PORTAL</span><h1>Temas</h1><p>El tema elegido se aplica al inicio, al acceso y a las demás pantallas de los jugadores.</p></div></div>
    <section className="theme-section" aria-labelledby="available-themes-title">
      <div className="theme-section-heading"><div><span className="eyebrow">01 · APARIENCIA</span><h2 id="available-themes-title">Tema del portal</h2><p>Elegí el estilo que verán todos los jugadores.</p></div><span className="theme-current-label">Actual: {themes.find(option => option.id === theme)?.name}</span></div>
      {themeError && <p className="alert error" role="alert">{themeError}</p>}
      <div className="theme-presets" role="group" aria-label="Temas disponibles">
        {themes.map(({ id, name, description, Icon }) => <button key={id} type="button" className={`theme-preset theme-preset-${id} ${theme === id ? 'active' : ''}`} aria-pressed={theme === id} disabled={themeBusy || demo} onClick={() => void selectTheme(id)}><span className={`theme-swatch ${id}`}><Icon /></span><span className="theme-preset-copy"><strong>{name}</strong><small>{description}</small></span><span className="theme-preset-status">{theme === id ? <><Check size={14} /> Activo</> : 'Aplicar'}</span></button>)}
      </div>
    </section>
    <section className="theme-banner-editor">
      <div className="theme-editor-heading"><div><span className="eyebrow">02 · CONTENIDO DEL INICIO</span><h2>Banner de bonos</h2><p>{theme === 'dark' ? 'El tema Oscuro muestra su propio banner con la promoción integrada en la imagen.' : 'Usá una imagen o un video para el banner de bonos. «Ir al casino» conserva su banner.'}</p></div></div>
      {error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert" role="status">{notice}</p>}
      <div className={`theme-banner-preview ${theme === 'dark' ? 'dark-banner-preview' : ''}`} aria-label="Vista previa del banner de bonos">
        {theme === 'dark' ? <img src="/preview-assets/dark-bonus-banner.png" alt="Banner de bonos incluido en el tema Oscuro" /> : source ? previewVideo ? <video key={source} src={source} autoPlay muted loop playsInline controls preload="metadata" /> : preview ? <img src={source} alt="Vista previa del nuevo banner" /> : path ? <StorageImage path={path} alt="Banner de bonos actual" /> : null : <img src="/preview-assets/load-bonus-banner-v2.webp" alt="Banner de bonos incluido" />}
      </div>
      {theme === 'dark' ? <p className="theme-banner-note">La imagen ya contiene los textos y montos. El banner «Ir al casino» conserva su configuración.</p> : <form onSubmit={event => void save(event)}>
        <label htmlFor="theme-bonus-media"><ImagePlus size={17} /> Imagen o video del banner</label>
        <input id="theme-bonus-media" ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" disabled={busy || demo} onChange={event => { setFile(event.target.files?.[0] ?? null); setError(''); setNotice(''); }} />
        <small><Video size={14} /> JPG, PNG, WebP, MP4 o WebM · máximo 20 MB. El video se reproduce sin sonido y en bucle.</small>
        <div className="theme-banner-actions"><button className="primary" type="submit" disabled={busy || demo || !file}>{busy ? 'Guardando…' : 'Guardar banner'}</button>{(path || file) && <button type="button" disabled={busy || demo} onClick={() => void restore()}>Usar imagen incluida</button>}</div>
      </form>}
    </section>
  </div>;
}
