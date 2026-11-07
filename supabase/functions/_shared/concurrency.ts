export async function forEachConcurrent<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Math.min(items.length, Math.max(1, Math.floor(limit) || 1));
  await Promise.all(Array.from({ length: workers }, async () => {
    while (cursor < items.length) await task(items[cursor++]);
  }));
}
