import { useEffect, useRef, useState } from 'react';

const values = new Map<string, unknown>();
let generation = 0;
export function clearViewState() { generation++; values.clear(); }

// Only interface preferences live here; no records, credentials or receipts.
export function useViewState<T>(key: string, initial: T) {
  const version = useRef(generation);
  const [value, setValue] = useState<T>(() => values.has(key) ? values.get(key) as T : initial);
  useEffect(() => { if (version.current === generation) values.set(key, value); }, [key, value]);
  return [value, setValue] as const;
}
