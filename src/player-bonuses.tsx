import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { bonusButtonLayoutStyles, normalizeBonusBannerLayout, specialBonusDisplayLayout } from './bonus-banner-layout';
import { useContent, StorageImage, type Promotion } from './content';
import { money, supabase } from './lib';
import { homeBannerLayoutStyles } from './home-banner';
import { percentText } from '../supabase/functions/_shared/bonus-rule';
import { themeBase } from './portal-theme-design';
import type { CSSProperties } from 'react';

type Availability = { promotion_id: string; next_available_at: string | null; awaiting_credit: boolean; server_now: string };

function countdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function reward(offer: Promotion) {
  return offer.bonus_mode === 'fixed' ? `+${money(offer.bonus_amount)}` : `+${percentText(offer.bonus_percent)}%`;
}

export function PlayerBonuses({ demo, onClaim }: { demo: boolean; onClaim: (id: string) => void }) {
  const { promotions, settings } = useContent();
  const [availability, setAvailability] = useState<Record<string, Availability>>({});
  const [ready, setReady] = useState(!supabase || demo);
  const [now, setNow] = useState(Date.now);
  const [clockOffset, setClockOffset] = useState(0);
  const offers = promotions.filter(offer => offer.selectable && (offer.bonus_mode === 'fixed' ? offer.bonus_amount > 0 : offer.bonus_percent > 0));
  const timedOffers = offers.filter(offer => offer.cooldown_hours > 0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (demo || !supabase || !timedOffers.length) { setReady(true); return; }
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
    const channel = db.channel('player-bonus-availability')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'special_bonus_uses' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposit_credits' }, () => void refresh())
      .subscribe();
    return () => { alive = false; window.removeEventListener('focus', refresh); window.clearInterval(poll); void db.removeChannel(channel); };
  }, [demo, timedOffers.length]);

  return <section className="player-bonuses" aria-label="Bonos disponibles">
    {!offers.length ? <div className="player-bonuses-empty"><Gift size={28} /><strong>No hay bonos disponibles</strong><span>Cuando haya nuevas promociones, aparecerán acá.</span></div> : offers.map(offer => {
      const timed = offer.cooldown_hours > 0;
      const status = availability[offer.id];
      const remaining = status?.next_available_at ? Date.parse(status.next_available_at) - now - clockOffset : 0;
      const statusReady = !timed || (ready && (!supabase || demo || !!status));
      const canClaim = !timed || (statusReady && !status?.awaiting_credit && remaining <= 0);
      const layout = specialBonusDisplayLayout(normalizeBonusBannerLayout(offer.banner_layout, themeBase(settings)));
      const video = !!offer.image_path && /\.(mp4|webm)$/i.test(offer.image_path);
      const mediaUrl = offer.image_path && video ? supabase?.storage.from('app-assets').getPublicUrl(offer.image_path).data.publicUrl : null;
      return <article className={`player-bonus-card${timed ? ' is-timed' : ''}`} style={{ ...homeBannerLayoutStyles(layout), ...bonusButtonLayoutStyles(normalizeBonusBannerLayout(offer.banner_layout, themeBase(settings))) } as CSSProperties} key={offer.id} aria-label={offer.title}>
        {offer.image_path ? video ? <video className="player-bonus-media" src={mediaUrl ?? undefined} autoPlay muted loop playsInline preload="metadata" aria-label={offer.title} /> : <StorageImage path={offer.image_path} alt={offer.title} className="player-bonus-media" /> : <div className="player-bonus-placeholder" aria-hidden="true" />}
        <div className="player-bonus-copy">
          {!offer.image_path && <>
            <strong className="player-bonus-title">{offer.title}</strong>
            <span className="player-bonus-range">Desde {money(offer.min_amount)} hasta {money(offer.max_amount)}</span>
            <strong className="player-bonus-reward">{reward(offer)}</strong>
          </>}
          {timed && (!statusReady ? <span className="player-bonus-state">Consultando disponibilidad…</span> : status?.awaiting_credit ? <span className="player-bonus-state">Carga con bono en proceso</span> : remaining > 0 ? <><span className="player-bonus-state">Disponible nuevamente en</span><strong className="player-bonus-countdown" role="timer">{countdown(remaining)}</strong></> : <button type="button" disabled={!canClaim} onClick={() => onClaim(offer.id)}>Obtener</button>)}
          {!timed && <button type="button" onClick={() => onClaim(offer.id)}>Obtener</button>}
        </div>
      </article>;
    })}
  </section>;
}
