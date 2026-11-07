import { bonusScheduleOpen, hasBonusSchedule, nextBonusScheduleOpen } from '../supabase/functions/_shared/bonus-schedule';
import { useBonusScheduleClock } from './bonus-schedule-clock';
import { sharedPlayerRpc } from './player-resource';
import { VisibleVideo } from './visible-video';
import { useEffect, useMemo, useState } from 'react';
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
  const [clockOffset, setClockOffset] = useState(0);
  const scheduleNow = useBonusScheduleClock(promotions, clockOffset);
  const [availability, setAvailability] = useState<Record<string, Availability>>({});
  const [ready, setReady] = useState(!supabase || demo);
  const [now, setNow] = useState(Date.now);
  const [rulesOffer, setRulesOffer] = useState<Promotion | null>(null);
  const [nextLoadNumber, setNextLoadNumber] = useState<number | null>(demo || !supabase ? 1 : null);
  const [loadNumberReady, setLoadNumberReady] = useState(demo || !supabase);
  const offers = useMemo(() => promotions.filter(offer => offer.selectable && (offer.reward_type === 'free_spins' ? !!offer.reward_label : offer.bonus_mode === 'fixed' ? offer.bonus_amount > 0 : offer.bonus_percent > 0)), [promotions]);
  const visibleOffers = useMemo(() => offers.filter(offer => offer.active && (offer.load_number_to === null || nextLoadNumber !== null && nextLoadNumber <= offer.load_number_to)), [offers, nextLoadNumber]);
  const timedOffers = visibleOffers.filter(offer => offer.cooldown_hours > 0);
  const availableAt = useMemo(() => Object.fromEntries(visibleOffers.map(offer => {
    const cooldown = offer.cooldown_hours > 0 ? Date.parse(availability[offer.id]?.next_available_at ?? '') : NaN;
    const earliest = Math.max(scheduleNow + clockOffset, Number.isFinite(cooldown) ? cooldown : 0);
    return [offer.id, nextBonusScheduleOpen(offer, earliest)];
  })), [visibleOffers, availability, scheduleNow, clockOffset]);
  const currentTime = Math.max(now, scheduleNow) + clockOffset;
  const hasCountdown = visibleOffers.some(offer => nextLoadNumber !== null && nextLoadNumber >= offer.load_number_from
    && !availability[offer.id]?.awaiting_credit && (availableAt[offer.id] ?? 0) > currentTime);
  useEffect(() => {
    if (!hasCountdown) return;
    let timer = 0;
    const sync = () => {
      window.clearInterval(timer);
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      timer = window.setInterval(() => setNow(Date.now()), 1000);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', sync); };
  }, [hasCountdown]);
  useEffect(() => {
    if (demo || !supabase) { setNextLoadNumber(1); setLoadNumberReady(true); return; }
    let alive = true;
    async function refreshLoadNumber() {
      const { data, error } = await sharedPlayerRpc<number>('player_next_deposit_number');
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
    let alive = true;
    async function refresh() {
      const { data, error } = await sharedPlayerRpc<Availability[]>('special_bonus_availability');
      if (!alive) return;
      setReady(!error);
      if (!error) {
        const rows = (data ?? []) as Availability[];
        if (rows[0]) setClockOffset(Date.parse(rows[0].server_now) - Date.now());
        setAvailability(Object.fromEntries(rows.map(item => [item.promotion_id, item])));
      }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    const poll = window.setInterval(() => { if (document.visibilityState !== 'hidden') void refresh(); }, 300_000);
    return () => { alive = false; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVisible); window.clearInterval(poll); };
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
      const remaining = Math.max(0, (availableAt[offer.id] ?? currentTime) - currentTime);
      const statusReady = !timed || (ready && (!supabase || demo || !!status));
      const waiting = (hasBonusSchedule(offer) || offer.reward_type === 'free_spins' && !!offer.daily_reset_time) && statusReady && !status?.awaiting_credit && remaining > 0;
      const scheduleOpen = bonusScheduleOpen(offer, scheduleNow + clockOffset);
      const canClaim = scheduleOpen && loadEligible && (!timed || (statusReady && !status?.awaiting_credit && remaining <= 0));
      const layout = specialBonusDisplayLayout(normalizeBonusBannerLayout(offer.banner_layout, themeBase(settings)));
      const video = !!offer.image_path && /\.(mp4|webm)$/i.test(offer.image_path);
      const mediaUrl = offer.image_path && video ? supabase?.storage.from('app-assets').getPublicUrl(offer.image_path).data.publicUrl : null;
      const buttonLayout = normalizeBonusBannerLayout(offer.banner_layout, themeBase(settings));
      return <article className={`player-bonus-card${timed ? ' is-timed' : ''}${waiting ? ' is-waiting' : ''}`} style={{ ...homeBannerLayoutStyles(layout), ...bonusButtonLayoutStyles(buttonLayout) } as CSSProperties} key={offer.id} aria-label={offer.title}>
        {offer.image_path ? video ? <VisibleVideo className="player-bonus-media" src={mediaUrl ?? undefined} autoPlay muted loop playsInline preload="metadata" aria-label={offer.title} /> : <StorageImage path={offer.image_path} alt={offer.title} className="player-bonus-media" /> : <div className="player-bonus-placeholder" aria-hidden="true" />}
        <div className={`player-bonus-copy${waiting ? ' is-waiting' : ''}`}>
          {!offer.image_path && <>
            <strong className="player-bonus-title">{offer.title}</strong>
            <span className="player-bonus-range">Desde {money(offer.min_amount)} hasta {money(offer.max_amount)}</span>
            <strong className="player-bonus-reward">{reward(offer)}</strong>
          </>}
          {!loadEligible && <span className="player-bonus-state">{!loadNumberReady ? 'Verificando tu número de carga…' : nextLoadNumber === null ? 'No pudimos verificar tu número de carga. Recargá la página.' : `Este bono aplica en ${loadWindowText}. Tu próxima carga es la n.º ${nextLoadNumber}.`}</span>}
          {loadEligible && (!statusReady ? <span className="player-bonus-state">Consultando disponibilidad…</span> : status?.awaiting_credit ? <span className="player-bonus-state">Carga con bono en proceso</span> : remaining > 0 ? <><span className="player-bonus-state">Disponible en</span><strong className="player-bonus-countdown" role="timer" aria-label="Tiempo hasta que el bono esté disponible">{countdown(remaining)}</strong></> : scheduleOpen ? <button type="button" disabled={!canClaim} onClick={() => { if (bonusScheduleOpen(offer, Date.now() + clockOffset)) onClaim(offer.id); }}>Obtener</button> : <span className="player-bonus-state">No disponible</span>)}
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
