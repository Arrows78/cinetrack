import { describe, expect, it, vi } from "vitest";

const invokeCommandMock = vi.fn();
vi.mock("@/shared/lib/invoke", () => ({ invokeCommand: (...args: unknown[]) => invokeCommandMock(...args) }));

import { statsRepository } from "../stats-repository";

describe("statsRepository.getOnThisDayEvents", () => {
  it("invokes list_on_this_day_events with the given reference date", async () => {
    invokeCommandMock.mockResolvedValue([]);

    await statsRepository.getOnThisDayEvents("2026-08-22T12:00:00.000Z");

    expect(invokeCommandMock).toHaveBeenCalledWith("list_on_this_day_events", { today: "2026-08-22T12:00:00.000Z" });
  });

  it("defaults `today` to the current instant when not provided", async () => {
    invokeCommandMock.mockResolvedValue([]);

    await statsRepository.getOnThisDayEvents();

    const [, args] = invokeCommandMock.mock.calls[0] as [string, { today: string }];
    expect(Number.isNaN(new Date(args.today).getTime())).toBe(false);
  });

  it("returns whatever the command resolves with", async () => {
    const events = [{ id: "1" }];
    invokeCommandMock.mockResolvedValue(events);

    const result = await statsRepository.getOnThisDayEvents("2026-08-22T12:00:00.000Z");

    expect(result).toBe(events);
  });
});
