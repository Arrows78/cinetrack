import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isTauriAppMock = vi.fn(() => false);
vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => isTauriAppMock() }));

vi.mock("@/shared/config/env", () => ({ env: { VITE_TMDB_API_TOKEN: undefined } }));

vi.mock("@tauri-apps/api/path", () => ({ appDataDir: vi.fn(async () => "/mock/app-data") }));

const storeGet = vi.fn();
const storeInsert = vi.fn();
const strongholdSave = vi.fn(async () => undefined);
const loadClient = vi.fn();
const createClient = vi.fn();
const strongholdLoad = vi.fn();

vi.mock("@tauri-apps/plugin-stronghold", () => ({
  Stronghold: { load: (...args: unknown[]) => strongholdLoad(...args) },
}));

const BROWSER_KEY = "cinetrack.tmdb-token";

async function importFresh() {
  vi.resetModules();
  return import("../token-vault");
}

function mockClient() {
  return { getStore: () => ({ get: storeGet, insert: storeInsert }) };
}

describe("tokenVault", () => {
  beforeEach(() => {
    isTauriAppMock.mockReturnValue(false);
    window.localStorage.clear();
    storeGet.mockReset();
    storeInsert.mockReset();
    strongholdSave.mockClear();
    loadClient.mockReset();
    createClient.mockReset();
    strongholdLoad.mockReset();
    strongholdLoad.mockResolvedValue({ loadClient, createClient, save: strongholdSave });
    loadClient.mockResolvedValue(mockClient());
  });

  describe("outside Tauri (browser fallback)", () => {
    it("starts locked with no token configured", async () => {
      const { tokenVault } = await importFresh();
      expect(tokenVault.getSnapshot()).toEqual({ unlocked: false, configured: false, source: null });
      expect(tokenVault.getToken()).toBeNull();
    });

    it("initialize() reads a previously saved token from localStorage", async () => {
      window.localStorage.setItem(BROWSER_KEY, "stored-token");
      const { tokenVault } = await importFresh();

      await tokenVault.initialize();

      expect(tokenVault.getToken()).toBe("stored-token");
      expect(tokenVault.getSnapshot()).toEqual({ unlocked: true, configured: true, source: "browser" });
    });

    it("initialize() leaves the vault unconfigured when localStorage has nothing", async () => {
      const { tokenVault } = await importFresh();
      await tokenVault.initialize();
      expect(tokenVault.getSnapshot()).toEqual({ unlocked: false, configured: false, source: null });
    });

    it("unlock() delegates to initialize() and reports whether a token was found", async () => {
      window.localStorage.setItem(BROWSER_KEY, "stored-token");
      const { tokenVault } = await importFresh();
      await expect(tokenVault.unlock("unused")).resolves.toBe(true);
      expect(tokenVault.getToken()).toBe("stored-token");
    });

    it("unlock() reports false when there is nothing to find", async () => {
      const { tokenVault } = await importFresh();
      await expect(tokenVault.unlock("unused")).resolves.toBe(false);
    });

    it("save() rejects a blank token", async () => {
      const { tokenVault } = await importFresh();
      await expect(tokenVault.save("unused", "   ")).rejects.toThrow();
      expect(window.localStorage.getItem(BROWSER_KEY)).toBeNull();
    });

    it("save() trims and persists the token to localStorage and notifies subscribers", async () => {
      const { tokenVault } = await importFresh();
      const listener = vi.fn();
      const unsubscribe = tokenVault.subscribe(listener);

      await tokenVault.save("unused", "  my-token  ");

      expect(window.localStorage.getItem(BROWSER_KEY)).toBe("my-token");
      expect(tokenVault.getToken()).toBe("my-token");
      expect(tokenVault.getSnapshot()).toEqual({ unlocked: true, configured: true, source: "browser" });
      expect(listener).toHaveBeenCalled();

      unsubscribe();
    });

    it("subscribe() returns an unsubscribe function that stops further notifications", async () => {
      const { tokenVault } = await importFresh();
      const listener = vi.fn();
      const unsubscribe = tokenVault.subscribe(listener);
      unsubscribe();

      await tokenVault.save("unused", "my-token");

      expect(listener).not.toHaveBeenCalled();
    });

    it("lock() clears the token and marks the vault as locked", async () => {
      const { tokenVault } = await importFresh();
      await tokenVault.save("unused", "my-token");

      tokenVault.lock();

      expect(tokenVault.getToken()).toBeNull();
      expect(tokenVault.getSnapshot()).toEqual({ unlocked: false, configured: true, source: "browser" });
    });
  });

  describe("with an env-provided token", () => {
    afterEach(() => {
      // Restore the file-level default rather than fully unmocking — an
      // unmock here would also undo the top-level vi.mock() for every test
      // that runs after this block, silently letting the real env.ts (and
      // whatever real VITE_TMDB_API_TOKEN happens to be in .env) leak in.
      vi.doMock("@/shared/config/env", () => ({ env: { VITE_TMDB_API_TOKEN: undefined } }));
    });

    it("starts unlocked and configured, sourced from env", async () => {
      vi.doMock("@/shared/config/env", () => ({ env: { VITE_TMDB_API_TOKEN: "env-token" } }));
      const { tokenVault } = await importFresh();

      expect(tokenVault.getToken()).toBe("env-token");
      expect(tokenVault.getSnapshot()).toEqual({ unlocked: true, configured: true, source: "env" });
    });

    it("lock() is a no-op for an env-sourced token", async () => {
      vi.doMock("@/shared/config/env", () => ({ env: { VITE_TMDB_API_TOKEN: "env-token" } }));
      const { tokenVault } = await importFresh();

      tokenVault.lock();

      expect(tokenVault.getToken()).toBe("env-token");
      expect(tokenVault.getSnapshot()).toEqual({ unlocked: true, configured: true, source: "env" });
    });
  });

  describe("inside Tauri (Stronghold vault)", () => {
    beforeEach(() => {
      isTauriAppMock.mockReturnValue(true);
    });

    it("unlock() decodes and stores the token found in the vault", async () => {
      storeGet.mockResolvedValue(Array.from(new TextEncoder().encode("vault-token")));
      const { tokenVault } = await importFresh();

      const unlocked = await tokenVault.unlock("hunter2");

      expect(strongholdLoad).toHaveBeenCalledWith("/mock/app-data/cinetrack-vault.hold", "hunter2");
      expect(unlocked).toBe(true);
      expect(tokenVault.getToken()).toBe("vault-token");
      expect(tokenVault.getSnapshot()).toEqual({ unlocked: true, configured: true, source: "vault" });
    });

    it("unlock() reports failure when the vault has no stored token", async () => {
      storeGet.mockResolvedValue(undefined);
      const { tokenVault } = await importFresh();

      const unlocked = await tokenVault.unlock("hunter2");

      expect(unlocked).toBe(false);
      expect(tokenVault.getToken()).toBeNull();
      expect(tokenVault.getSnapshot()).toEqual({ unlocked: true, configured: false, source: "vault" });
    });

    it("unlock() creates a fresh client when the vault has none yet", async () => {
      loadClient.mockRejectedValue(new Error("no client"));
      createClient.mockResolvedValue(mockClient());
      storeGet.mockResolvedValue(undefined);
      const { tokenVault } = await importFresh();

      await tokenVault.unlock("hunter2");

      expect(createClient).toHaveBeenCalledWith("cinetrack");
    });

    it("save() encodes and inserts the token, then persists the vault", async () => {
      const { tokenVault } = await importFresh();

      await tokenVault.save("hunter2", "  new-token  ");

      expect(storeInsert).toHaveBeenCalledWith("tmdb-bearer-token", Array.from(new TextEncoder().encode("new-token")));
      expect(strongholdSave).toHaveBeenCalledTimes(1);
      expect(tokenVault.getToken()).toBe("new-token");
      expect(tokenVault.getSnapshot()).toEqual({ unlocked: true, configured: true, source: "vault" });
    });

    it("save() still rejects a blank token before touching the vault", async () => {
      const { tokenVault } = await importFresh();
      await expect(tokenVault.save("hunter2", "")).rejects.toThrow();
      expect(strongholdLoad).not.toHaveBeenCalled();
    });

    it("lock() clears a vault-sourced token", async () => {
      storeGet.mockResolvedValue(Array.from(new TextEncoder().encode("vault-token")));
      const { tokenVault } = await importFresh();
      await tokenVault.unlock("hunter2");

      tokenVault.lock();

      expect(tokenVault.getToken()).toBeNull();
      expect(tokenVault.getSnapshot()).toEqual({ unlocked: false, configured: true, source: "vault" });
    });
  });
});
