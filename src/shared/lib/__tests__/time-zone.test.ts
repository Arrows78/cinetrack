import { afterEach, describe, expect, it, vi } from "vitest";
import { getViewerTimeZone } from "../time-zone";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getViewerTimeZone", () => {
  it("returns the IANA identifier the runtime resolves", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: "Europe/Paris" }) }) as Intl.DateTimeFormat
    );

    expect(getViewerTimeZone()).toBe("Europe/Paris");
  });

  it("matches the real runtime zone when nothing is mocked", () => {
    expect(getViewerTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("is null when the runtime cannot name its zone, so the caller falls back to a fixed offset", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: undefined }) }) as unknown as Intl.DateTimeFormat
    );
    expect(getViewerTimeZone()).toBeNull();

    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new RangeError("no Intl");
    });
    expect(getViewerTimeZone()).toBeNull();
  });
});
