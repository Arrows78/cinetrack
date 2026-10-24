import { describe, expect, it } from "vitest";
import { createLimiter, mapWithConcurrency } from "../concurrency";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("createLimiter", () => {
  it("never runs more than `max` tasks at once and still runs them all, in order", async () => {
    const limit = createLimiter(2);
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    const task = (id: number) => async () => {
      started.push(id);
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
      return id;
    };

    const results = await Promise.all([1, 2, 3, 4, 5].map((id) => limit(task(id))));

    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
    expect(started).toEqual([1, 2, 3, 4, 5]);
  });

  it("frees its slot when a task fails, so later tasks are not stuck", async () => {
    const limit = createLimiter(1);

    await expect(limit(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(limit(() => Promise.resolve("next"))).resolves.toBe("next");
  });
});

describe("mapWithConcurrency", () => {
  it("visits every item with at most `concurrency` workers in flight", async () => {
    let running = 0;
    let peak = 0;
    const seen: number[] = [];

    await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6],
      async (item) => {
        running += 1;
        peak = Math.max(peak, running);
        await tick();
        running -= 1;
        seen.push(item);
      },
      3
    );

    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(peak).toBe(3);
  });
});
