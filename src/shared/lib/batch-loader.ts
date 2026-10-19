/**
 * Collects the single-key reads a screen issues in the same instant — one per
 * card of a grid, one per row of a list — into one batched call, so the number
 * of IPC round trips stays flat as the screen grows instead of growing with
 * it. Each caller still gets its own promise and keeps its own cache entry
 * (a TanStack Query per key); only the transport is shared.
 *
 * Reads issued within `delayMs` of the first one leave together, at most
 * `maxBatch` keys per call. The same key asked for twice in one batch is sent
 * once, and both callers get its answer. A failed batch rejects every caller
 * waiting on it with the same error, so each surfaces it through its own
 * query state, never swallowed. That includes a `run` that throws before
 * returning a promise, and one that answers fewer keys than it was given: the
 * keys without an answer are rejected rather than left pending forever (or
 * resolved with a value that was never read).
 */
export interface BatchLoader<Key, Value> {
  load(key: Key): Promise<Value>;
}

interface Waiting<Value> {
  resolve: (value: Value) => void;
  reject: (reason: unknown) => void;
}

export function createBatchLoader<Key, Value>(options: {
  /** Answers every key it is given, in the same order. */
  run: (keys: Key[]) => Promise<Value[]>;
  /** Identity of a key, so duplicates inside one batch are sent once. */
  keyOf: (key: Key) => string;
  maxBatch?: number;
  delayMs?: number;
}): BatchLoader<Key, Value> {
  const { run, keyOf, maxBatch = 200, delayMs = 0 } = options;
  let pending = new Map<string, { key: Key; waiting: Waiting<Value>[] }>();
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    const batch = pending;
    pending = new Map();
    const entries = [...batch.values()];
    for (let start = 0; start < entries.length; start += maxBatch) {
      const chunk = entries.slice(start, start + maxBatch);
      let result: Promise<Value[]>;
      try {
        result = run(chunk.map((entry) => entry.key));
      } catch (error) {
        // A synchronous throw would otherwise escape the timer callback and
        // leave every waiter of this (and any later) chunk pending.
        result = Promise.reject(error);
      }
      result.then(
        (values) => {
          chunk.forEach((entry, index) => {
            if (index >= values.length) {
              const error = new Error(`Batch loader: run answered ${values.length} of ${chunk.length} keys`);
              for (const waiting of entry.waiting) waiting.reject(error);
              return;
            }
            for (const waiting of entry.waiting) waiting.resolve(values[index] as Value);
          });
        },
        (error: unknown) => {
          for (const entry of chunk) for (const waiting of entry.waiting) waiting.reject(error);
        }
      );
    }
  };

  return {
    load(key) {
      return new Promise<Value>((resolve, reject) => {
        const id = keyOf(key);
        const existing = pending.get(id);
        if (existing) existing.waiting.push({ resolve, reject });
        else pending.set(id, { key, waiting: [{ resolve, reject }] });
        if (!scheduled) {
          scheduled = true;
          setTimeout(flush, delayMs);
        }
      });
    },
  };
}
