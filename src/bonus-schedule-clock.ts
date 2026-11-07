import { useEffect, useState } from 'react';
import { nextBonusScheduleChange, type BonusSchedule } from '../supabase/functions/_shared/bonus-schedule';

export function useBonusScheduleClock(rows: readonly BonusSchedule[]) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'hidden') return;
      const current = Date.now();
      setNow(current);
      const next = nextBonusScheduleChange(rows, current);
      if (next !== null) timer = window.setTimeout(tick, Math.max(50, next - current + 20));
    };
    tick();
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); };
  }, [rows]);
  return now;
}
