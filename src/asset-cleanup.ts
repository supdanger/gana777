import { supabase } from './lib';

export function referencedStrings(value: unknown, result = new Set<string>()): Set<string> {
  if (typeof value === 'string') result.add(value);
  else if (Array.isArray(value)) for (const item of value) referencedStrings(item, result);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) referencedStrings(item, result);
  return result;
}

// A lost HTTP response does not prove the save failed. Re-read settings before
// deleting new uploads so a committed image can never be removed by rollback.
export async function cleanupFailedSettingsUploads(paths: string[]) {
  if (!supabase || !paths.length) return;
  try {
    const current = await supabase.from('app_settings').select('*').eq('id', true).single();
    if (current.error || !current.data) return;
    const references = referencedStrings(current.data);
    const unused = paths.filter(path => !references.has(path));
    if (unused.length) await supabase.storage.from('app-assets').remove(unused);
  } catch { /* Prefer an orphan to removing an asset whose commit is unknown. */ }
}
