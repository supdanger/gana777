import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, ImagePlus } from 'lucide-react';
import { InputError } from '../supabase/functions/_shared/validation';
import { StorageImage, useContent } from './content';
import { bannerImageExtension, defaultHomeBanner, homeBannerColumns, parseHomeBanner } from './home-banner';
import { supabase } from './lib';
import { safeHttpsLink } from './security';
import casinoBanner from './assets/home-casino-banner-v3.png';

export function PortalAdmin({ demo, busy, action }: { demo: boolean; busy: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const { reloadPromotions: reloadContent } = useContent();
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState(defaultHomeBanner.home_banner_title);
  const [url, setUrl] = useState('');
  const [path, setPath] = useState<string | null>(null);
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
      if (error) { setFailure('No pudimos cargar el banner. Aplicá la migración 023 y revisá tu conexión y permisos.'); return; }
      setEnabled(data.home_banner_enabled); setTitle(data.home_banner_title); setUrl(data.home_banner_url ?? ''); setPath(data.home_banner_path);
    });
    return () => { alive = false; };
  }, [demo]);
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
      const payload = parseHomeBanner(enabled, title, url, nextPath);
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

  const safeUrl = safeHttpsLink(url);
  return <section className="portal-admin">
    <div className="account-heading"><div><h1>Portal de jugadores</h1><p>Configurá el botón con banner que aparece antes de Cargar en el inicio.</p></div></div>
    {failure ? <p className="empty" role="alert">{failure}</p> : <form className="portal-banner-form" onSubmit={save}>
      <fieldset disabled={busy || loading || demo}>
        <legend><ImagePlus size={21} /> Botón del inicio</legend>
        <label className="portal-banner-toggle"><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setSaved(false); }} />Mostrar en el portal</label>
        <label>Nombre del botón<input value={title} onChange={event => { setTitle(event.target.value); setSaved(false); }} maxLength={80} required /><small>Identifica la imagen para accesibilidad y si no carga.</small></label>
        <label>Página de destino<input type="url" value={url} onChange={event => { setUrl(event.target.value); setSaved(false); }} placeholder="https://ejemplo.com" maxLength={2048} required={enabled} /><small>Se abre en otra pestaña. El portal no agrega datos del jugador al enlace.</small></label>
        <label>Imagen del banner<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { setFile(event.target.files?.[0] ?? null); setUseIncluded(false); setSaved(false); }} /><small>Incluimos tu banner definitivo «Gana777bet.com · Ir al casino». Se adapta a la tarjeta completa sin estirar la imagen. Para reemplazar el anterior, elegí «Usar banner incluido» y guardá. JPG, PNG o WebP · Hasta 5 MB.</small></label>
        <div className="portal-banner-preview" aria-label="Vista previa del banner">{preview ? <img src={preview} alt={title} /> : path && !useIncluded ? <StorageImage path={path} alt={title} /> : <img src={casinoBanner} alt="Gana777bet.com · Ir al casino" />}</div>
        <button type="button" onClick={() => { setFile(null); setUseIncluded(true); setSaved(false); if (fileInput.current) fileInput.current.value = ''; }}>Usar banner incluido «Ir al casino»</button>
        <div className="portal-banner-actions"><button type="submit">{loading ? 'Cargando…' : 'Guardar banner'}</button>{safeUrl && <a href={safeUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Probar enlace</a>}</div>
      </fieldset>
      {saved && <p role="status">Banner guardado. {enabled ? 'Ya está habilitado en el inicio.' : 'El botón está oculto.'}</p>}
    </form>}
    <p className="portal-banner-permissions">Disponible para superadministradores y cajeros con permiso de Contactos.</p>
  </section>;
}
