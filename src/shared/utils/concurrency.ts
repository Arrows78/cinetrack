// Runs `worker` over `items` with at most `concurrency` in flight at once —
// for fanning out a batch of independent network calls (TMDB detail lookups,
// per-title resolution) without firing all of them simultaneously.
export async function mapWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]!);
    }
  });
  await Promise.all(runners);
}
