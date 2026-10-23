import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ImagePlus, Moon, Palette, Sparkles, Snowflake, Video } from 'lucide-react';
import { supabase } from './lib';
import { StorageImage, useContent } from './content';

const maxMediaSize = 20 * 1024 * 1024;
const mediaTypes: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm',
};

export function ThemesAdmin({ demo }: { demo: boolean }) {
  const { settings, reloadPromotions: reloadContent } = useContent();
  const [path, setPath] = useState<string | null>(settings.home_bonus_media_path);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setPath(settings.home_bonus_media_path), [settings.home_bonus_media_path]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
    <div className="page-title"><div><span className="eyebrow">APARIENCIA DEL PORTAL</span><h1>Temas</h1><p>Elegí el aspecto del portal y administrá el banner de bonos del inicio.</p></div></div>
    <div className="theme-presets" aria-label="Temas definidos">
      <article className="theme-preset active"><span className="theme-swatch base"><Palette /></span><div><h2>Base</h2><p>Azules profundos y acentos celestes.</p></div><strong>Activo</strong></article>
      <article className="theme-preset"><span className="theme-swatch dark"><Moon /></span><div><h2>Oscuro</h2><p>Próximamente</p></div></article>
      <article className="theme-preset"><span className="theme-swatch christmas"><Snowflake /></span><div><h2>Navidad</h2><p>Próximamente</p></div></article>
      <article className="theme-preset"><span className="theme-swatch new-year"><Sparkles /></span><div><h2>Año Nuevo</h2><p>Próximamente</p></div></article>
    </div>
    <section className="theme-banner-editor">
      <div className="theme-editor-heading"><div><span className="eyebrow">TEMA BASE</span><h2>Banner de bonos</h2><p>Reemplazá la imagen actual por una imagen o un video. «Ir al casino» conserva su banner.</p></div></div>
      {error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert" role="status">{notice}</p>}
      <div className="theme-banner-preview" aria-label="Vista previa del banner de bonos">
        {source ? previewVideo ? <video key={source} src={source} autoPlay muted loop playsInline controls preload="metadata" /> : preview ? <img src={source} alt="Vista previa del nuevo banner" /> : path ? <StorageImage path={path} alt="Banner de bonos actual" /> : null : <img src="/preview-assets/load-bonus-banner-v2.webp" alt="Banner de bonos incluido" />}
      </div>
      <form onSubmit={event => void save(event)}>
        <label htmlFor="theme-bonus-media"><ImagePlus size={17} /> Imagen o video del banner</label>
        <input id="theme-bonus-media" ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" disabled={busy || demo} onChange={event => { setFile(event.target.files?.[0] ?? null); setError(''); setNotice(''); }} />
        <small><Video size={14} /> JPG, PNG, WebP, MP4 o WebM · máximo 20 MB. El video se reproduce sin sonido y en bucle.</small>
        <div className="theme-banner-actions"><button className="primary" type="submit" disabled={busy || demo || !file}>{busy ? 'Guardando…' : 'Guardar banner'}</button>{(path || file) && <button type="button" disabled={busy || demo} onClick={() => void restore()}>Usar imagen incluida</button>}</div>
      </form>
    </section>
  </div>;
}
