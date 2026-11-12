import { useEffect, useState } from 'react';
import { supabase } from './lib';
type Pause = { until: number; reason: string; lastReason: string; offset: number };
const empty: Pause = { until: 0, reason: '', lastReason: '', offset: 0 };
export function useWithdrawalPause(enabled: boolean, revision: number) {
  const [pause, setPause] = useState<Pause>(empty);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled || !supabase) { setPause(empty); setLoading(false); setError(''); return; }
    const db = supabase;
    const controller = new AbortController();
    let running = false, queued = false;
    const load = async () => {
      if (controller.signal.aborted) return;
      if (running) { queued = true; return; }
      running = true; setLoading(true);
      try {
        const start = Date.now();
        const result = await db.rpc('get_my_withdrawal_pause').abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        const end = Date.now(), server = Date.parse(result.data?.server_now ?? '');
        if (result.error || !Number.isFinite(server)) { setError('No pudimos verificar la disponibilidad de retiros. Intentá nuevamente.'); return; }
        const until = result.data.paused_until ? Date.parse(result.data.paused_until) : 0;
        if (!Number.isFinite(until)) { setError('No pudimos verificar la disponibilidad de retiros. Intentá nuevamente.'); return; }
        setPause({ until, offset: server - (start + end) / 2, reason: result.data.reason ?? '', lastReason: result.data.last_rejection?.reason ?? '' });
        setError('');
      } finally {
        running = false;
        if (!controller.signal.aborted) { setLoading(false); if (queued) { queued = false; void load(); } }
      }
    };
    void load();
    const visible = () => { if (document.visibilityState !== 'hidden') void load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { controller.abort(); document.removeEventListener('visibilitychange', visible); };
  }, [enabled, revision, retry]);
  return { ...pause, loading, error, retry: () => setRetry(value => value + 1) };
}
