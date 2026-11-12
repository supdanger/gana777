import { useEffect, useRef, useState } from 'react';
import { supabase } from './lib';
import { ADMIN_LIVE_SCOPES, createAdminLiveBatch, type AdminLiveScope } from './admin-live-batch';

export type AdminLiveStatus = 'connecting' | 'live' | 'offline' | 'demo';
export function useAdminLive(userId: string | undefined, enabled: boolean, onChanges: (scopes: AdminLiveScope[]) => void, permissionKey: string) {
  const callback = useRef(onChanges); callback.current = onChanges;
  const [status, setStatus] = useState<AdminLiveStatus>(enabled ? 'connecting' : 'demo');
  useEffect(() => {
    if (!enabled || !supabase || !userId) { setStatus('demo'); return; }
    const db = supabase;
    let alive = true;
    let initialized = false;
    let syncing = false;
    let queued = false;
    const batch = createAdminLiveBatch({ emit: scopes => callback.current(scopes), visible: () => document.visibilityState !== 'hidden', schedule: run => window.setTimeout(run, 750), cancel: handle => window.clearTimeout(handle as number) });
    const sync = async () => {
      if (!alive || document.visibilityState === 'hidden') return;
      if (syncing) { queued = true; return; }
      syncing = true;
      try {
        const result = await db.from('admin_live_signals').select('scope,version');
        if (!alive) return;
        if (result.error) { setStatus('offline'); return; }
        for (const row of result.data ?? []) if (ADMIN_LIVE_SCOPES.includes(row.scope as AdminLiveScope)) batch.observe(row.scope as AdminLiveScope, Number(row.version), !initialized && Number(row.version) === 0);
        initialized = true;
        setStatus('live');
        batch.wake();
      } finally {
        syncing = false;
        if (alive && queued) { queued = false; void sync(); }
      }
    };
    setStatus('connecting');
    const channel = db.channel(`admin-live-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'admin_live_signals' }, payload => {
        if (!alive) return;
        const row = payload.new;
        if (ADMIN_LIVE_SCOPES.includes(row.scope as AdminLiveScope)) batch.observe(row.scope as AdminLiveScope, Number(row.version));
      })
      .subscribe(next => {
        if (!alive) return;
        setStatus(next === 'SUBSCRIBED' ? 'live' : 'offline');
        if (next === 'SUBSCRIBED') void sync();
      });
    const visible = () => { if (document.visibilityState !== 'hidden') { batch.wake(); void sync(); } };
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; batch.stop(); document.removeEventListener('visibilitychange', visible); void db.removeChannel(channel); };
  }, [userId, enabled, permissionKey]);
  return status;
}
