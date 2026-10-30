import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { supabase } from './lib';
import { StorageImage, useContent } from './content';
import { BannerLayoutEditor } from './banner-layout-editor';
import { normalizeBonusBannerLayout } from './bonus-banner-layout';
import type { BuiltInTheme, PortalTheme } from './portal-theme-design';
import { defaultPortalBannerLayout, maxPortalBannersPerPlace, normalizePortalBanners, type PortalBanner, type PortalBannerPlace } from './portal-banners';

const mediaTypes: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm',
};
const maxMediaSize = 20 * 1024 * 1024;
const places: { id: PortalBannerPlace; title: string; hint: string }[] = [
  { id: 'home', title: 'Más banners del inicio', hint: 'Se agregan al carrusel de Inicio, después del banner principal. Usá Subir/Bajar para elegir el orden.' },
  { id: 'withdrawal', title: 'Banners de retiros', hint: 'La primera imagen queda dentro de la tarjeta de estado del retiro, y el texto queda encima. Solo en este tema.' },
];

export function PortalBannersAdmin({ theme, baseTheme, demo }: { theme: PortalTheme; baseTheme: BuiltInTheme; demo: boolean }) {
  const { settings, reloadPromotions } = useContent();
  const [banners, setBanners] = useState<PortalBanner[]>(() => normalizePortalBanners(settings.portal_banners));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const bannersRef = useRef(banners);
  const dirty = useRef(false);
  bannersRef.current = banners;

  useEffect(() => {
    if (dirty.current) return;
    setBanners(normalizePortalBanners(settings.portal_banners));
  }, [settings.portal_banners]);

  async function toggleHomeBanners() {
    if (demo || !supabase || busy) return;
    setBusy(true); setError(''); setNotice('');
    const next = settings.home_banners_visible === false;
    const { error } = await supabase.rpc('set_home_banners_visible', { p_visible: next });
    if (error) setError('No pudimos guardar la visibilidad. Revisá la migración 079 y tus permisos.');
    else { reloadPromotions(); setNotice(next ? 'Banners del inicio activados.' : 'Banners del inicio ocultos. Las imágenes siguen guardadas.'); }
    setBusy(false);
  }

  async function persist(next: PortalBanner[], savedBannerId: string | null, message: string) {
    if (demo || !supabase) return;
    setBusy(true); setError(''); setNotice('');
    const result = await supabase.from('app_settings').update({ portal_banners: next }).eq('id', true).select('portal_banners').single();
    setBusy(false);
    if (result.error) {
      setError('No pudimos guardar los banners. Revisá la migración 054 y tus permisos.');
      return;
    }
    dirty.current = false;
    setBanners(normalizePortalBanners(result.data.portal_banners));
    setSavedId(savedBannerId);
    setNotice(message);
    reloadPromotions();
  }

  async function addBanner(place: PortalBannerPlace, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || demo || !supabase) return;
    const extension = mediaTypes[file.type];
    const current = banners.filter(banner => banner.theme === theme && banner.place === place);
    if (!extension || file.size === 0 || file.size > maxMediaSize) {
      setError('Elegí una imagen JPG, PNG o WebP, o un video MP4 o WebM de hasta 20 MB.');
      return;
    }
    if (current.length >= maxPortalBannersPerPlace) {
      setError(`Podés tener hasta ${maxPortalBannersPerPlace} banners en cada lugar.`);
      return;
    }
    const editing = dirty.current;
    dirty.current = true;
    setBusy(true); setError(''); setNotice('');
    const id = crypto.randomUUID();
    const path = `portal-banners/${id}.${extension}`;
    const uploaded = await supabase.storage.from('app-assets').upload(path, file, { contentType: file.type, upsert: false });
    setBusy(false);
    if (uploaded.error) {
      dirty.current = editing;
      setError('No pudimos subir el archivo. Revisá la migración 054 y volvé a intentar.');
      return;
    }
    await persist([...bannersRef.current, { id, theme, place, path, layout: defaultPortalBannerLayout(baseTheme, place) }], null, 'Banner agregado.');
  }

  const visible = (place: PortalBannerPlace) => banners.filter(banner => banner.theme === theme && banner.place === place);

  return <div className="portal-extra-admin">
    <section className="card">
      <h3>Banners en el inicio</h3>
      <p>Mostrá u ocultá todo el carrusel del inicio en todos los temas, sin borrar las imágenes configuradas.</p>
      <button type="button" className={`external-chat-toggle${settings.home_banners_visible !== false ? ' is-active' : ''}`} role="switch" aria-label="Mostrar banners en el inicio" aria-checked={settings.home_banners_visible !== false} disabled={busy || demo} onClick={() => void toggleHomeBanners()}>
        <span className="external-chat-toggle-knob" /><span>{busy ? 'Guardando…' : settings.home_banners_visible !== false ? 'Visibles' : 'Ocultos'}</span>
      </button>
    </section>
    {error && <p className="alert error" role="alert">{error}</p>}
    {notice && <p className="alert" role="status">{notice}</p>}
    {places.map(place => <section key={place.id} aria-labelledby={`extra-banners-${place.id}`}>
      <h3 id={`extra-banners-${place.id}`}>{place.title}</h3>
      <p>{place.hint}</p>
      {visible(place.id).map((banner, index, list) => {
        const video = /\.(mp4|webm)$/i.test(banner.path);
        return <div className="portal-extra-card" key={banner.id}>
          <BannerLayoutEditor label={`${place.title} ${index + 1}`} layout={banner.layout} defaults={defaultPortalBannerLayout(baseTheme, place.id)} heightRange={[25, 80]} disabled={busy || demo} saved={savedId === banner.id} onChange={layout => { dirty.current = true; setBanners(current => current.map(item => item.id === banner.id ? { ...item, layout: normalizeBonusBannerLayout(layout, baseTheme) } : item)); setSavedId(null); setNotice(''); }} onSave={() => void persist(bannersRef.current, banner.id, '')}>
            {video ? <video src={supabase?.storage.from('app-assets').getPublicUrl(banner.path).data.publicUrl} autoPlay muted loop playsInline preload="metadata" /> : <StorageImage path={banner.path} alt="" />}
          </BannerLayoutEditor>
          <div className="portal-extra-card-actions">
            <button type="button" disabled={busy || demo || index === 0} onClick={() => void persist(moveBanner(bannersRef.current, banner.id, -1), null, '')}>Subir</button>
            <button type="button" disabled={busy || demo || index === list.length - 1} onClick={() => void persist(moveBanner(bannersRef.current, banner.id, 1), null, '')}>Bajar</button>
            <button type="button" disabled={busy || demo} onClick={() => void persist(bannersRef.current.filter(item => item.id !== banner.id), null, 'Banner quitado.')}><Trash2 size={14} /> Quitar</button>
          </div>
        </div>;
      })}
      {!visible(place.id).length && <p className="portal-extra-empty">Todavía no hay banners acá.</p>}
      <label className={`portal-extra-add${busy || demo || visible(place.id).length >= maxPortalBannersPerPlace ? ' is-disabled' : ''}`}><ImagePlus size={16} /> Agregar banner<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" disabled={busy || demo || visible(place.id).length >= maxPortalBannersPerPlace} onChange={event => void addBanner(place.id, event)} /></label>
    </section>)}
  </div>;
}

function moveBanner(banners: PortalBanner[], id: string, direction: -1 | 1) {
  const current = banners.find(banner => banner.id === id);
  if (!current) return banners;
  const group = banners.filter(banner => banner.theme === current.theme && banner.place === current.place);
  const neighbor = group[group.findIndex(banner => banner.id === id) + direction];
  if (!neighbor) return banners;
  const from = banners.findIndex(banner => banner.id === id);
  const to = banners.findIndex(banner => banner.id === neighbor.id);
  const next = banners.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
