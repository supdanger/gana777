export type AdminLiveScope = 'deposit' | 'withdrawal' | 'chat' | 'external-chat' | 'access-requests' | 'users' | 'platform' | 'shifts' | 'accounts' | 'bonuses' | 'settings' | 'staff';
export const ADMIN_LIVE_SCOPES: AdminLiveScope[] = ['deposit','withdrawal','chat','external-chat','access-requests','users','platform','shifts','accounts','bonuses','settings','staff'];

// A single scheduled flush coalesces a burst without starving under a busy stream.
export function createAdminLiveBatch({ emit, visible, schedule, cancel }: {
  emit: (scopes: AdminLiveScope[]) => void; visible: () => boolean;
  schedule: (run: () => void) => unknown; cancel: (handle: unknown) => void;
}) {
  const versions = new Map<AdminLiveScope, number>();
  const dirty = new Set<AdminLiveScope>();
  let timer: unknown = null;
  let stopped = false;
  function flush() {
    timer = null;
    if (stopped || !visible() || !dirty.size) return;
    const scopes = [...dirty]; dirty.clear(); emit(scopes);
  }
  function wake() { if (!stopped && visible() && dirty.size && timer === null) timer = schedule(flush); }
  return {
    observe(scope: AdminLiveScope, version: number, baseline = false) {
      if (stopped || !Number.isSafeInteger(version) || version < 0 || version <= (versions.get(scope) ?? -1)) return;
      const known = versions.has(scope); versions.set(scope, version);
      if (!baseline || known) { dirty.add(scope); wake(); }
    },
    wake,
    stop() { stopped = true; dirty.clear(); if (timer !== null) cancel(timer); timer = null; },
  };
}
