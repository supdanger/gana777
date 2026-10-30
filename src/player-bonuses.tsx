import { useEffect, useState } from 'react';
import { Gift, Info, X } from 'lucide-react';
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
  if (offer.reward_type === 'free_spins') return offer.reward_label;
  return offer.bonus_mode === 'fixed' ? `+${money(offer.bonus_amount)}` : `+${percentText(offer.bonus_percent)}%`;
}

export function PlayerBonuses({ demo, onClaim }: { demo: boolean; onClaim: (id: string) => void }) {
  const { promotions, settings } = useContent();
  const [availability, setAvailability] = useState<Record<string, Availability>>({});
  const [ready, setReady] = useState(!supabase || demo);
  const [now, setNow] = useState(Date.now);
  const [clockOffset, setClockOffset] = useState(0);
  const [rulesOffer, setRulesOffer] = useState<Promotion | null>(null);
  const [nextLoadNumber, setNextLoadNumber] = useState<number | null>(demo || !supabase ? 1 : null);
  const [loadNumberReady, setLoadNumberReady] = useState(demo || !supabase);
  const offers = promotions.filter(offer => offer.selectable && (offer.reward_type === 'free_spins' ? !!offer.reward_label : offer.bonus_mode === 'fixed' ? offer.bonus_amount > 0 : offer.bonus_percent > 0));
  const visibleOffers = offers.filter(offer => !loadNumberReady || nextLoadNumber === null || offer.load_number_to === null || nextLoadNumber <= offer.load_number_to);
  const timedOffers = visibleOffers.filter(offer => offer.cooldown_hours > 0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (demo || !supabase) { setNextLoadNumber(1); setLoadNumberReady(true); return; }
    let alive = true;
    const db = supabase;
    async function refreshLoadNumber() {
      const { data, error } = await db.rpc('player_next_deposit_number');
      if (!alive) return;
      const number = Number(data);
      setNextLoadNumber(error || !Number.isInteger(number) || number < 1 ? null : number);
      setLoadNumberReady(true);
    }
    void refreshLoadNumber();
    window.addEventListener('focus', refreshLoadNumber);
    return () => { alive = false; window.removeEventListener('focus', refreshLoadNumber); };
  }, [demo]);
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
    {!visibleOffers.length ? <div className="player-bonuses-empty"><Gift size={28} /><strong>No hay bonos disponibles</strong><span>Cuando haya nuevas promociones, aparecerán acá.</span></div> : visibleOffers.map(offer => {
      const timed = offer.cooldown_hours > 0;
      const loadEligible = nextLoadNumber !== null && nextLoadNumber >= offer.load_number_from
        && (offer.load_number_to === null || nextLoadNumber <= offer.load_number_to);
      const loadWindowText = offer.load_number_to === null
        ? offer.load_number_from === 1 ? 'todas las cargas' : `desde la carga ${offer.load_number_from}`
        : offer.load_number_from === offer.load_number_to ? `solo la carga ${offer.load_number_from}` : `de la carga ${offer.load_number_from} a la ${offer.load_number_to}`;
      const status = availability[offer.id];
      const remaining = status?.next_available_at ? Date.parse(status.next_available_at) - now - clockOffset : 0;
      const statusReady = !timed || (ready && (!supabase || demo || !!status));
      const waiting = offer.reward_type === 'free_spins' && !!offer.daily_reset_time && statusReady && !status?.awaiting_credit && remaining > 0;
      const canClaim = loadEligible && (!timed || (statusReady && !status?.awaiting_credit && remaining <= 0));
      const layout = specialBonusDisplayLayout(normalizeBonusBannerLayout(offer.banner_layout, themeBase(settings)));
      const video = !!offer.image_path && /\.(mp4|webm)$/i.test(offer.image_path);
      const mediaUrl = offer.image_path && video ? supabase?.storage.from('app-assets').getPublicUrl(offer.image_path).data.publicUrl : null;
      const buttonLayout = normalizeBonusBannerLayout(offer.banner_layout, themeBase(settings));
      return <article className={`player-bonus-card${timed ? ' is-timed' : ''}${waiting ? ' is-waiting' : ''}`} style={{ ...homeBannerLayoutStyles(layout), ...bonusButtonLayoutStyles(buttonLayout) } as CSSProperties} key={offer.id} aria-label={offer.title}>
        {offer.image_path ? video ? <video className="player-bonus-media" src={mediaUrl ?? undefined} autoPlay muted loop playsInline preload="metadata" aria-label={offer.title} /> : <StorageImage path={offer.image_path} alt={offer.title} className="player-bonus-media" /> : <div className="player-bonus-placeholder" aria-hidden="true" />}
        <div className={`player-bonus-copy${waiting ? ' is-waiting' : ''}`}>
          {!offer.image_path && <>
            <strong className="player-bonus-title">{offer.title}</strong>
            <span className="player-bonus-range">Desde {money(offer.min_amount)} hasta {money(offer.max_amount)}</span>
            <strong className="player-bonus-reward">{reward(offer)}</strong>
          </>}
          {!loadEligible && <span className="player-bonus-state">{!loadNumberReady ? 'Verificando tu número de carga…' : nextLoadNumber === null ? 'No pudimos verificar tu número de carga. Recargá la página.' : `Este bono aplica en ${loadWindowText}. Tu próxima carga es la n.º ${nextLoadNumber}.`}</span>}
          {loadEligible && timed && (!statusReady ? <span className="player-bonus-state">Consultando disponibilidad…</span> : status?.awaiting_credit ? <span className="player-bonus-state">Carga con bono en proceso</span> : remaining > 0 ? <><span className="player-bonus-state">Disponible nuevamente en</span><strong className="player-bonus-countdown" role="timer">{countdown(remaining)}</strong></> : <button type="button" disabled={!canClaim} onClick={() => onClaim(offer.id)}>Obtener</button>)}
          {loadEligible && !timed && <button type="button" disabled={!canClaim} onClick={() => onClaim(offer.id)}>Obtener</button>}
        </div>
        <button type="button" className="player-bonus-info-button" aria-label={`Ver información de ${offer.title}`} title={`Información de ${offer.title}`} onClick={() => setRulesOffer(offer)}><Info size={18} aria-hidden="true" /></button>
      </article>;
    })}
    {rulesOffer && <div className="player-bonus-rules-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setRulesOffer(null); }}>
      <section className="player-bonus-rules-dialog" role="dialog" aria-modal="true" aria-labelledby="player-bonus-rules-title">
        <header><div><small>INFORMACIÓN DEL BONO</small><h2 id="player-bonus-rules-title">{rulesOffer.title}</h2></div><button type="button" aria-label="Cerrar información" onClick={() => setRulesOffer(null)}><X size={20} /></button></header>
        <div className="player-bonus-rules-text">{rulesOffer.rules_text.trim() || 'Este bono todavía no tiene información adicional publicada.'}</div>
      </section>
    </div>}
  </section>;
}
