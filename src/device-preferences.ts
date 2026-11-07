export function readDevicePreference(key: string, fallback: string | null = null): string | null {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function writeDevicePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Optional device preference. */ }
}
