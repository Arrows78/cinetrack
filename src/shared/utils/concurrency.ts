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

/**
 * A shared gate: at most `max` of the calls passed to the returned function
 * run at once, the rest wait their turn in order. For work that is started
 * from many independent places (one TanStack query per series, say), where
 * `mapWithConcurrency` has no single list to iterate.
 */
export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: Array<() => void> = [];
  const release = () => {
    running -= 1;
    waiting.shift()?.();
  };
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= max) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}
