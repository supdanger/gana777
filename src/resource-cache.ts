// Only public presentation data belongs in persistent storage. Private responses
// use the bounded, session-only cache and are discarded when the account changes.
type Entry = { value: unknown; expiresAt: number };
const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();
let generation = 0;
const MAX_ENTRIES = 100;

export async function cachedResource<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const running = pending.get(key);
  if (running) return running as Promise<T>;
  const version = generation;
  const task = Promise.resolve().then(loader).then(value => {
    if (version === generation) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: Date.now() + ttl });
      while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
    }
    return value;
  }).finally(() => { if (pending.get(key) === task) pending.delete(key); });
  pending.set(key, task);
  return task;
}

export function clearResourceCache() {
  generation++;
  entries.clear();
  pending.clear();
}

export function invalidateResourcePrefix(prefix: string) {
  generation++;
  for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
  for (const key of pending.keys()) if (key.startsWith(prefix)) pending.delete(key);
}

export function readPublicSnapshot<T>(storage: Pick<Storage, 'getItem' | 'removeItem'>, key: string, maxAge: number): T | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const age = Date.now() - saved.savedAt;
    if (saved.version !== 1 || !Number.isFinite(age) || age < 0 || age > maxAge) {
      storage.removeItem(key);
      return null;
    }
    return saved.value as T;
  } catch { return null; }
}

export function writePublicSnapshot(storage: Pick<Storage, 'setItem'>, key: string, value: unknown) {
  try { storage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), value })); }
  catch { /* Storage may be disabled or full; the network remains authoritative. */ }
}
