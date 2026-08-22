import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ShareCancelledError,
  downloadWrappedCard,
  renderWrappedCard,
  type WrappedExportData,
  type WrappedExportLabels,
} from "../wrapped-export";

const isMobileAppMock = vi.fn(() => false);
vi.mock("@/shared/lib/platform", () => ({ isMobileApp: () => isMobileAppMock() }));

const mkdirMock = vi.fn();
const writeFileMock = vi.fn();
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppCache: "AppCache" },
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

const appCacheDirMock = vi.fn(() => Promise.resolve("/app/cache"));
const joinMock = vi.fn((...parts: string[]) => Promise.resolve(parts.join("/")));
vi.mock("@tauri-apps/api/path", () => ({
  appCacheDir: () => appCacheDirMock(),
  join: (...args: unknown[]) => joinMock(...(args as string[])),
}));

const shareFileMock = vi.fn<(url: string, options?: unknown) => Promise<void>>(() => Promise.resolve());
vi.mock("@choochmeque/tauri-plugin-sharekit-api", () => ({
  shareFile: (url: string, options?: unknown) => shareFileMock(url, options),
}));

describe("downloadWrappedCard", () => {
  beforeEach(() => {
    isMobileAppMock.mockReset().mockReturnValue(false);
    mkdirMock.mockReset().mockResolvedValue(undefined);
    writeFileMock.mockReset().mockResolvedValue(undefined);
    appCacheDirMock.mockReset().mockResolvedValue("/app/cache");
    joinMock.mockReset().mockImplementation((...parts: string[]) => Promise.resolve(parts.join("/")));
    shareFileMock.mockReset().mockResolvedValue(undefined);
  });

  it("on desktop, triggers a download anchor named after the wrapped year and revokes the object URL", async () => {
    const blob = new Blob(["fake-png"], { type: "image/png" });
    const objectUrl = "blob:mock-url";
    const createObjectURL = vi.fn(() => objectUrl);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const anchor = document.createElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => undefined);
    vi.spyOn(document, "createElement").mockReturnValueOnce(anchor);

    await downloadWrappedCard(blob, 2026);

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.href).toBe(objectUrl);
    expect(anchor.download).toBe("cinetrack-wrapped-2026.png");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl);
    expect(shareFileMock).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("on mobile, stages the PNG in the app cache dir and opens the native share sheet on it", async () => {
    isMobileAppMock.mockReturnValue(true);
    const blob = new Blob(["fake-png"], { type: "image/png" });

    await downloadWrappedCard(blob, 2026);

    expect(mkdirMock).toHaveBeenCalledWith("shares", { baseDir: "AppCache", recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith("shares/cinetrack-wrapped-2026.png", expect.any(Uint8Array), {
      baseDir: "AppCache",
    });
    expect(shareFileMock).toHaveBeenCalledWith("file:///app/cache/shares/cinetrack-wrapped-2026.png", {
      mimeType: "image/png",
      title: "cinetrack-wrapped-2026.png",
    });
  });

  it("on mobile, wraps a share-sheet cancellation into ShareCancelledError", async () => {
    isMobileAppMock.mockReturnValue(true);
    shareFileMock.mockRejectedValueOnce(new Error("Share cancelled"));
    const blob = new Blob(["fake-png"], { type: "image/png" });

    await expect(downloadWrappedCard(blob, 2026)).rejects.toBeInstanceOf(ShareCancelledError);
  });

  it("on mobile, propagates a real share failure unchanged", async () => {
    isMobileAppMock.mockReturnValue(true);
    shareFileMock.mockRejectedValueOnce(new Error("disk full"));
    const blob = new Blob(["fake-png"], { type: "image/png" });

    await expect(downloadWrappedCard(blob, 2026)).rejects.toThrow("disk full");
  });
});

// Custom-property values in this app's "H S% L%" token format (see
// src/styles/index.css) for exactly the tokens wrapped-export.ts reads.
const TOKENS: Record<string, string> = {
  "--background": "231 33% 8%",
  "--foreground": "220 18% 97%",
  "--muted-foreground": "220 12% 68%",
  "--primary": "252 80% 70%",
  "--card": "228 24% 12%",
  "--border": "222 15% 22%",
};

/**
 * jsdom's canvas 2D context is always null (no `canvas` npm package is
 * installed here — see the task's own note and package.json). This builds a
 * plausible fake context whose drawing calls are spies, plus a
 * deterministic `measureText` (width = text.length * 10) so `ellipsize`'s
 * real truncation loop runs against real, if synthetic, widths.
 */
function createFakeCtx() {
  const fillStyleHistory: unknown[] = [];
  const strokeStyleHistory: unknown[] = [];
  const fillTextCalls: Array<{ text: string; x: number; y: number }> = [];
  let fillStyle: unknown = "";
  let strokeStyle: unknown = "";

  const gradient = { addColorStop: vi.fn() };

  const ctx = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: unknown) {
      fillStyle = value;
      fillStyleHistory.push(value);
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(value: unknown) {
      strokeStyle = value;
      strokeStyleHistory.push(value);
    },
    lineWidth: 0,
    font: "",
    textBaseline: "alphabetic",
    createLinearGradient: vi.fn(() => gradient),
    fillRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn((text: string, x: number, y: number) => {
      fillTextCalls.push({ text, x, y });
    }),
    measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
  };

  return { ctx, gradient, fillStyleHistory, strokeStyleHistory, fillTextCalls };
}

describe("renderWrappedCard", () => {
  const labels: WrappedExportLabels = {
    brand: "CineTrack",
    tagline: "Your year in review",
    wrappedTitle: "Wrapped",
    favouriteGenreLabel: "Favourite genre:",
  };

  const baseData: WrappedExportData = {
    year: 2026,
    hoursWatchedLabel: "120 hours watched",
    moviesEpisodesLabel: "42 films · 310 episodes",
    favouriteGenre: "Science Fiction",
    activeDaysLabel: "210 active days",
    topTitles: [{ title: "Arcane", count: 12 }],
  };

  let fake: ReturnType<typeof createFakeCtx>;
  let getPropertyValueSpy: ReturnType<typeof vi.fn>;
  let toBlobSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fake = createFakeCtx();
    getPropertyValueSpy = vi.fn((name: string) => TOKENS[name] ?? "");

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((contextId: string) => (contextId === "2d" ? fake.ctx : null)) as any
    );
    toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(((
      callback: (blob: Blob | null) => void
    ) => {
      callback(new Blob(["fake-png"], { type: "image/png" }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (() => ({ getPropertyValue: getPropertyValueSpy })) as any
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves a PNG blob for a normal data/labels fixture", async () => {
    const blob = await renderWrappedCard(baseData, labels);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
  });

  it("throws when canvas 2D context is unavailable", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(renderWrappedCard(baseData, labels)).rejects.toThrow("Canvas 2D context unavailable");
  });

  it("rejects when toBlob() yields no blob", async () => {
    toBlobSpy.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((callback: (blob: Blob | null) => void) => callback(null)) as any
    );
    await expect(renderWrappedCard(baseData, labels)).rejects.toThrow("Canvas toBlob() returned null");
  });

  it("ellipsizes a title long enough to exceed the content width, leaving a short one untouched", async () => {
    const longTitle = "A".repeat(120);
    await renderWrappedCard(
      {
        ...baseData,
        topTitles: [
          { title: "Arcane", count: 12 },
          { title: longTitle, count: 3 },
        ],
      },
      labels
    );

    const texts = fake.fillTextCalls.map((call) => call.text);
    const shortLine = texts.find((text) => text.startsWith("1. Arcane"));
    const longLine = texts.find((text) => text.startsWith("2. AAAA"));
    const originalLongLine = `2. ${longTitle} · 3`;

    expect(shortLine).toBe("1. Arcane · 12");
    expect(longLine).toBeDefined();
    expect(longLine).not.toBe(originalLongLine);
    expect(longLine!.endsWith("…")).toBe(true);
    expect(longLine!.length).toBeLessThan(originalLongLine.length);
  });

  it("reads the app's HSL custom properties and formats both opaque and alpha color strings", async () => {
    await renderWrappedCard(baseData, labels);

    const queriedTokens = getPropertyValueSpy.mock.calls.map((call) => call[0] as string);
    for (const token of ["--background", "--foreground", "--muted-foreground", "--primary", "--card", "--border"]) {
      expect(queriedTokens).toContain(token);
    }

    const solidColors = fake.fillStyleHistory.filter(
      (value): value is string => typeof value === "string" && /^hsl\(\d+, \d+%, \d+%\)$/.test(value)
    );
    const alphaColors = fake.fillStyleHistory.filter(
      (value): value is string => typeof value === "string" && /^hsla\(\d+, \d+%, \d+%, [\d.]+\)$/.test(value)
    );

    // --primary drawn opaque (brand/year/wrappedTitle text) ...
    expect(solidColors).toContain("hsl(252, 80%, 70%)");
    // ... and the same token reused with alpha for the background gradient's
    // second stop (0.12) — passed to addColorStop, not assigned to fillStyle.
    const gradientStops = fake.gradient.addColorStop.mock.calls.map((call) => call[1]);
    expect(gradientStops).toContain("hsla(252, 80%, 70%, 0.12)");
    // --card is only ever drawn through the alpha branch (0.6), assigned as fillStyle.
    expect(alphaColors).toContain("hsla(228, 24%, 12%, 0.6)");
  });

  it("skips the favourite-genre line when null and the top-titles block when empty", async () => {
    await renderWrappedCard({ ...baseData, favouriteGenre: null, topTitles: [] }, labels);

    const texts = fake.fillTextCalls.map((call) => call.text);
    expect(texts.some((text) => text.includes(labels.favouriteGenreLabel))).toBe(false);
    expect(texts.some((text) => /^\d+\.\s/.test(text))).toBe(false);
  });

  it("draws the favourite-genre line when present and one row per top title", async () => {
    await renderWrappedCard(
      {
        ...baseData,
        topTitles: [
          { title: "Arcane", count: 12 },
          { title: "The Bear", count: 8 },
          { title: "Severance", count: 5 },
        ],
      },
      labels
    );

    const texts = fake.fillTextCalls.map((call) => call.text);
    expect(texts).toContain(`${labels.favouriteGenreLabel} ${baseData.favouriteGenre}`);
    expect(texts.filter((text) => /^\d+\.\s/.test(text))).toHaveLength(3);
  });
});
