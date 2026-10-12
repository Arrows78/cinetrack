import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBatchLoader } from "../batch-loader";

describe("createBatchLoader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the reads of one instant as a single batch and answers each caller its own key", async () => {
    const run = vi.fn(async (keys: number[]) => keys.map((key) => key * 10));
    const loader = createBatchLoader({ run, keyOf: String });

    const answers = Promise.all([loader.load(1), loader.load(2), loader.load(3)]);
    await vi.runAllTimersAsync();

    await expect(answers).resolves.toEqual([10, 20, 30]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("sends a key asked for twice once, and answers both callers", async () => {
    const run = vi.fn(async (keys: number[]) => keys.map((key) => key + 1));
    const loader = createBatchLoader({ run, keyOf: String });

    const answers = Promise.all([loader.load(5), loader.load(5)]);
    await vi.runAllTimersAsync();

    await expect(answers).resolves.toEqual([6, 6]);
    expect(run).toHaveBeenCalledWith([5]);
  });

  it("starts a new batch for reads that come after the previous one left", async () => {
    const run = vi.fn(async (keys: number[]) => keys);
    const loader = createBatchLoader({ run, keyOf: String });

    const first = loader.load(1);
    await vi.runAllTimersAsync();
    await first;
    const second = loader.load(2);
    await vi.runAllTimersAsync();
    await second;

    expect(run.mock.calls).toEqual([[[1]], [[2]]]);
  });

  it("splits a batch larger than maxBatch into several calls", async () => {
    const run = vi.fn(async (keys: number[]) => keys);
    const loader = createBatchLoader({ run, keyOf: String, maxBatch: 2 });

    const answers = Promise.all([1, 2, 3, 4, 5].map((key) => loader.load(key)));
    await vi.runAllTimersAsync();

    await expect(answers).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(run.mock.calls).toEqual([[[1, 2]], [[3, 4]], [[5]]]);
  });

  it("rejects every caller of a failed batch with its error, and recovers on the next one", async () => {
    const run = vi
      .fn<(keys: number[]) => Promise<number[]>>()
      .mockRejectedValueOnce(new Error("ipc failed"))
      .mockImplementation(async (keys) => keys);
    const loader = createBatchLoader({ run, keyOf: String });

    const failed = Promise.allSettled([loader.load(1), loader.load(2)]);
    await vi.runAllTimersAsync();
    const outcomes = await failed;
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["rejected", "rejected"]);

    const next = loader.load(3);
    await vi.runAllTimersAsync();
    await expect(next).resolves.toBe(3);
  });
});
