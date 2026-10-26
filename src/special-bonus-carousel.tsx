import { useEffect, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BonusBanner, StorageImage, useContent } from './content';
import { normalizeBonusBannerLayout } from './bonus-banner-layout';
import { homeBannerLayoutStyles } from './home-banner';
import { money, supabase } from './lib';
import { themeBase } from './portal-theme-design';

type Availability = { promotion_id: string; next_available_at: string | null; awaiting_credit: boolean; server_now: string };

function countdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function HomeBonusCarousel({ onClaim }: { onClaim: (id: string) => void }) {
  const { promotions, settings } = useContent();
  const specials = promotions.filter(p => p.selectable && p.cooldown_hours > 0);
  const hasMainBanner = promotions.some(p => p.show_banner);
  const [slide, setSlide] = useState(0);
  const [availability, setAvailability] = useState<Record<string, Availability>>({});
  const [ready, setReady] = useState(!supabase);
  const [now, setNow] = useState(Date.now);
  const [clockOffset, setClockOffset] = useState(0);
  const total = (hasMainBanner ? 1 : 0) + specials.length;
  useEffect(() => { setSlide(value => Math.max(0, Math.min(value, total - 1))); }, [total]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const db = supabase;
    let alive = true;
    async function refresh() {
      const { data, error } = await db.rpc('special_bonus_availability');
      if (!alive) return;
      setReady(!error);
      if (!error) {
        const rows = (data ?? []) as Availability[];
        if (rows[0]) setClockOffset(Date.parse(rows[0].server_now) - Date.now());
        setAvailability(Object.fromEntries(rows.map(item => [item.promotion_id, item])));
      }
    }
    void refresh();
    window.addEventListener('focus', refresh);
    const poll = window.setInterval(refresh, 15000);
    const channel = db.channel('special-bonus-availability')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'special_bonus_uses' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposit_credits' }, () => void refresh())
      .subscribe();
    return () => { alive = false; window.removeEventListener('focus', refresh); window.clearInterval(poll); void db.removeChannel(channel); };
  }, []);
  useEffect(() => {
    if (total < 2) return;
    const timer = window.setInterval(() => setSlide(value => (value + 1) % total), 8000);
    return () => window.clearInterval(timer);
  }, [total]);
  const special = specials[slide - (hasMainBanner ? 1 : 0)] ?? null;
  const status = special ? availability[special.id] : null;
  const remaining = status?.next_available_at ? new Date(status.next_available_at).getTime() - now - clockOffset : 0;
  const statusReady = ready && (!supabase || !!status);
  const canClaim = !!special && statusReady && !status?.awaiting_credit && remaining <= 0;
  const layout = special ? normalizeBonusBannerLayout(special.banner_layout, themeBase(settings)) : null;
  if (!total) return null;
  return <div className="home-bonus-carousel">
    {special && layout ? <section className="bonus-banner image-banner special-home-banner" style={homeBannerLayoutStyles(layout) as CSSProperties} aria-label={special.title}>
      {special.image_path ? /\.(mp4|webm)$/i.test(special.image_path) ? <video className="bonus-image" src={supabase?.storage.from('app-assets').getPublicUrl(special.image_path).data.publicUrl} autoPlay muted loop playsInline aria-label={special.title} /> : <StorageImage path={special.image_path} alt={special.title} className="bonus-image" /> : <div className="special-home-placeholder"><strong>{special.title}</strong><span>Desde {money(special.min_amount)} recibís +{money(special.bonus_amount)}</span></div>}
      <div className="special-banner-controls">
        <strong>{special.title}</strong>
        <span>{!statusReady ? 'Consultando disponibilidad…' : status?.awaiting_credit ? 'Carga con bono en proceso' : remaining > 0 ? `Disponible en ${countdown(remaining)}` : `Desde ${money(special.min_amount)} · +${money(special.bonus_amount)}`}</span>
        <button type="button" disabled={!canClaim} onClick={() => onClaim(special.id)}>{canClaim ? 'Obtener bono' : !statusReady ? 'Consultando bono…' : remaining > 0 ? countdown(remaining) : 'Esperá la acreditación'}</button>
      </div>
    </section> : <BonusBanner />}
    {total > 1 && <nav className="home-bonus-carousel-nav" aria-label="Banners de bonos"><button type="button" aria-label="Banner anterior" onClick={() => setSlide(value => (value - 1 + total) % total)}><ChevronLeft size={18} /></button><span>{slide + 1} / {total}</span><button type="button" aria-label="Banner siguiente" onClick={() => setSlide(value => (value + 1) % total)}><ChevronRight size={18} /></button></nav>}
  </div>;
}
