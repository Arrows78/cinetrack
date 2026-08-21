import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  mkdir: vi.fn(),
  readTextFile: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  stat: vi.fn(),
  writeTextFile: vi.fn(),
  isTauriApp: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: "AppData" },
  exists: mocks.exists,
  mkdir: mocks.mkdir,
  readTextFile: mocks.readTextFile,
  remove: mocks.remove,
  rename: mocks.rename,
  stat: mocks.stat,
  writeTextFile: mocks.writeTextFile,
}));

vi.mock("@/shared/lib/platform", () => ({
  isTauriApp: mocks.isTauriApp,
}));

import { logger } from "../logger";

const LOG_FILE = "logs/cinetrack.log";
const ROTATED_LOG_FILE = "logs/cinetrack.log.1";
const MAX_LOG_BYTES = 512 * 1024;

// Let any fire-and-forget promises inside appendLine/clear settle before assertions.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("logger", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Default happy-path resolutions so tests that don't care about the
    // file-append plumbing don't have to stub every call individually.
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.stat.mockRejectedValue(new Error("no such file"));
    mocks.remove.mockResolvedValue(undefined);
    mocks.rename.mockResolvedValue(undefined);
    mocks.writeTextFile.mockResolvedValue(undefined);
    mocks.readTextFile.mockResolvedValue("");
    mocks.exists.mockResolvedValue(true);
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe("console logging + Tauri gate", () => {
    it("info always logs to console.info with the raw message, and skips plugin-fs outside Tauri", async () => {
      mocks.isTauriApp.mockReturnValue(false);

      logger.info("hello world");
      await flush();

      expect(infoSpy).toHaveBeenCalledWith("hello world");
      expect(mocks.mkdir).not.toHaveBeenCalled();
      expect(mocks.writeTextFile).not.toHaveBeenCalled();
      expect(mocks.stat).not.toHaveBeenCalled();
    });

    it("warn always logs to console.warn with the raw message, and skips plugin-fs outside Tauri", async () => {
      mocks.isTauriApp.mockReturnValue(false);

      logger.warn("careful now");
      await flush();

      expect(warnSpy).toHaveBeenCalledWith("careful now");
      expect(mocks.mkdir).not.toHaveBeenCalled();
      expect(mocks.writeTextFile).not.toHaveBeenCalled();
    });

    it("error always logs to console.error with the raw message, and skips plugin-fs outside Tauri", async () => {
      mocks.isTauriApp.mockReturnValue(false);

      logger.error("boom");
      await flush();

      expect(errorSpy).toHaveBeenCalledWith("boom");
      expect(mocks.mkdir).not.toHaveBeenCalled();
      expect(mocks.writeTextFile).not.toHaveBeenCalled();
    });

    it("still logs to console even when isTauriApp() is true (file-append is additional)", async () => {
      mocks.isTauriApp.mockReturnValue(true);

      logger.info("hybrid message");
      await flush();

      expect(infoSpy).toHaveBeenCalledWith("hybrid message");
      expect(mocks.mkdir).toHaveBeenCalled();
    });
  });

  describe("file append path (Tauri)", () => {
    beforeEach(() => {
      mocks.isTauriApp.mockReturnValue(true);
    });

    it("mkdir's the log dir recursively in AppData before writing the line", async () => {
      logger.info("some message");
      await flush();

      expect(mocks.mkdir).toHaveBeenCalledWith("logs", { baseDir: "AppData", recursive: true });

      const mkdirOrder = mocks.mkdir.mock.invocationCallOrder[0]!;
      const writeOrder = mocks.writeTextFile.mock.invocationCallOrder[0]!;
      expect(mkdirOrder).toBeLessThan(writeOrder);
    });

    it("appends a line formatted as ISO-timestamp [LEVEL] message to LOG_FILE with append:true", async () => {
      logger.warn("disk almost full");
      await flush();

      expect(mocks.writeTextFile).toHaveBeenCalledTimes(1);
      const [path, contents, options] = mocks.writeTextFile.mock.calls[0]!;
      expect(path).toBe(LOG_FILE);
      expect(options).toEqual({ baseDir: "AppData", append: true });
      expect(contents).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[WARN\] disk almost full\n$/);
    });

    it("uses the matching level tag for error", async () => {
      logger.error("kaboom");
      await flush();

      const [, contents] = mocks.writeTextFile.mock.calls[0]!;
      expect(contents).toMatch(/\[ERROR\] kaboom\n$/);
    });
  });

  describe("rotation", () => {
    beforeEach(() => {
      mocks.isTauriApp.mockReturnValue(true);
    });

    it("does not rotate when the current log size is at the MAX_LOG_BYTES threshold", async () => {
      mocks.stat.mockResolvedValue({ size: MAX_LOG_BYTES });

      logger.info("still small");
      await flush();

      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.rename).not.toHaveBeenCalled();
      expect(mocks.writeTextFile).toHaveBeenCalledTimes(1);
    });

    it("does not rotate when the current log size is below the threshold", async () => {
      mocks.stat.mockResolvedValue({ size: MAX_LOG_BYTES - 1 });

      logger.info("still small");
      await flush();

      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.rename).not.toHaveBeenCalled();
    });

    it("rotates when the current log exceeds MAX_LOG_BYTES: removes the old rotated file then renames current to rotated", async () => {
      mocks.stat.mockResolvedValue({ size: MAX_LOG_BYTES + 1 });

      logger.info("too big now");
      await flush();

      expect(mocks.remove).toHaveBeenCalledWith(ROTATED_LOG_FILE, { baseDir: "AppData" });
      expect(mocks.rename).toHaveBeenCalledWith(LOG_FILE, ROTATED_LOG_FILE, {
        oldPathBaseDir: "AppData",
        newPathBaseDir: "AppData",
      });
      // Write must still happen after rotation.
      expect(mocks.writeTextFile).toHaveBeenCalledTimes(1);
    });

    it("swallows a rejection from remove during rotation and still proceeds to rename", async () => {
      mocks.stat.mockResolvedValue({ size: MAX_LOG_BYTES + 1 });
      mocks.remove.mockRejectedValue(new Error("no rotated file to remove"));

      logger.info("too big now");
      await flush();

      expect(mocks.rename).toHaveBeenCalledWith(LOG_FILE, ROTATED_LOG_FILE, {
        oldPathBaseDir: "AppData",
        newPathBaseDir: "AppData",
      });
      expect(mocks.writeTextFile).toHaveBeenCalledTimes(1);
    });

    it("catches a stat rejection (no log file yet) silently, skips rename, and still writes the line", async () => {
      mocks.stat.mockRejectedValue(new Error("ENOENT"));

      logger.info("first ever line");
      await flush();

      expect(mocks.rename).not.toHaveBeenCalled();
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.writeTextFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("error resilience", () => {
    beforeEach(() => {
      mocks.isTauriApp.mockReturnValue(true);
    });

    it("never lets a writeTextFile rejection propagate out of logger.info", async () => {
      mocks.writeTextFile.mockRejectedValue(new Error("disk full"));

      expect(() => logger.info("resilient")).not.toThrow();
      await flush();

      // console.info still happened despite the underlying file write failing.
      expect(infoSpy).toHaveBeenCalledWith("resilient");
    });

    it("never lets a mkdir rejection propagate out of logger.warn", async () => {
      mocks.mkdir.mockRejectedValue(new Error("permission denied"));

      expect(() => logger.warn("resilient warn")).not.toThrow();
      await flush();

      expect(warnSpy).toHaveBeenCalledWith("resilient warn");
      expect(mocks.writeTextFile).not.toHaveBeenCalled();
    });

    it("never lets a rename rejection propagate out of logger.error, and still writes the line (rotateIfNeeded swallows its own errors)", async () => {
      mocks.stat.mockResolvedValue({ size: MAX_LOG_BYTES + 1 });
      mocks.rename.mockRejectedValue(new Error("rename failed"));

      expect(() => logger.error("resilient error")).not.toThrow();
      await flush();

      expect(errorSpy).toHaveBeenCalledWith("resilient error");
      // rotateIfNeeded catches its own failures internally, so appendLine
      // proceeds past it and still writes the line.
      expect(mocks.writeTextFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("readRecent", () => {
    it("resolves to [] immediately outside Tauri, without touching plugin-fs", async () => {
      mocks.isTauriApp.mockReturnValue(false);

      const result = await logger.readRecent();

      expect(result).toEqual([]);
      expect(mocks.readTextFile).not.toHaveBeenCalled();
      expect(mocks.exists).not.toHaveBeenCalled();
    });

    it("reads both rotated and current files and concatenates rotated+current in that order", async () => {
      mocks.isTauriApp.mockReturnValue(true);
      mocks.exists.mockResolvedValue(true);
      mocks.readTextFile.mockImplementation(async (path: string) => {
        if (path === ROTATED_LOG_FILE) return "old-1\nold-2\n";
        if (path === LOG_FILE) return "new-1\nnew-2\n";
        return "";
      });

      const result = await logger.readRecent();

      expect(result).toEqual(["old-1", "old-2", "new-1", "new-2"]);
      const readPaths = mocks.readTextFile.mock.calls.map((call) => call[0]);
      expect(readPaths).toContain(ROTATED_LOG_FILE);
      expect(readPaths).toContain(LOG_FILE);
      const existsPaths = mocks.exists.mock.calls.map((call) => call[0]);
      expect(existsPaths).toContain(ROTATED_LOG_FILE);
      expect(existsPaths).toContain(LOG_FILE);
    });

    it("filters out empty lines produced by trailing newlines", async () => {
      mocks.isTauriApp.mockReturnValue(true);
      mocks.exists.mockResolvedValue(true);
      mocks.readTextFile.mockImplementation(async (path: string) => (path === LOG_FILE ? "line-a\n\nline-b\n" : ""));

      const result = await logger.readRecent();

      expect(result).toEqual(["line-a", "line-b"]);
    });

    it("returns only the last maxLines when more lines are present than requested", async () => {
      mocks.isTauriApp.mockReturnValue(true);
      mocks.exists.mockResolvedValue(true);
      mocks.readTextFile.mockImplementation(async (path: string) => (path === LOG_FILE ? "l1\nl2\nl3\nl4\nl5\n" : ""));

      const result = await logger.readRecent(2);

      expect(result).toEqual(["l4", "l5"]);
    });

    it("treats a missing file (exists() false) as an empty contribution rather than throwing", async () => {
      mocks.isTauriApp.mockReturnValue(true);
      mocks.exists.mockImplementation(async (path: string) => path !== ROTATED_LOG_FILE);
      mocks.readTextFile.mockImplementation(async (path: string) =>
        path === LOG_FILE ? "only-current\n" : "should-not-be-read"
      );

      const result = await logger.readRecent();

      expect(result).toEqual(["only-current"]);
      // readTextFile must not have been called for the rotated file since exists() was false.
      const readPaths = mocks.readTextFile.mock.calls.map((call) => call[0]);
      expect(readPaths).not.toContain(ROTATED_LOG_FILE);
    });

    it("treats a readTextFile rejection for one file as an empty contribution, not a rejected call", async () => {
      mocks.isTauriApp.mockReturnValue(true);
      mocks.exists.mockResolvedValue(true);
      mocks.readTextFile.mockImplementation(async (path: string) => {
        if (path === ROTATED_LOG_FILE) throw new Error("corrupt file");
        return "current-line\n";
      });

      const result = await logger.readRecent();

      expect(result).toEqual(["current-line"]);
    });
  });

  describe("clear", () => {
    it("is a no-op outside Tauri", async () => {
      mocks.isTauriApp.mockReturnValue(false);

      await logger.clear();

      expect(mocks.writeTextFile).not.toHaveBeenCalled();
      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it("writes an empty string to the current log and removes the rotated file", async () => {
      mocks.isTauriApp.mockReturnValue(true);

      await logger.clear();

      expect(mocks.writeTextFile).toHaveBeenCalledWith(LOG_FILE, "", { baseDir: "AppData" });
      expect(mocks.remove).toHaveBeenCalledWith(ROTATED_LOG_FILE, { baseDir: "AppData" });
    });

    it("does not let a writeTextFile rejection block the remove call, and does not throw", async () => {
      mocks.isTauriApp.mockReturnValue(true);
      mocks.writeTextFile.mockRejectedValue(new Error("disk full"));

      await expect(logger.clear()).resolves.toBeUndefined();

      expect(mocks.remove).toHaveBeenCalledWith(ROTATED_LOG_FILE, { baseDir: "AppData" });
    });

    it("does not let a remove rejection block the writeTextFile call, and does not throw", async () => {
      mocks.isTauriApp.mockReturnValue(true);
      mocks.remove.mockRejectedValue(new Error("file not found"));

      await expect(logger.clear()).resolves.toBeUndefined();

      expect(mocks.writeTextFile).toHaveBeenCalledWith(LOG_FILE, "", { baseDir: "AppData" });
    });
  });
});
