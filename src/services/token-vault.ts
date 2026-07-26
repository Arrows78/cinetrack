import { appDataDir } from "@tauri-apps/api/path";
import { Stronghold, type Client } from "@tauri-apps/plugin-stronghold";

import { env } from "@/shared/config/env";
import { isTauriApp } from "@/shared/lib/platform";

const CLIENT_NAME = "cinetrack";
const TOKEN_KEY = "tmdb-bearer-token";
const BROWSER_KEY = "cinetrack.tmdb-token";

type VaultSource = "env" | "vault" | "browser" | null;

type VaultSnapshot = {
  unlocked: boolean;
  configured: boolean;
  source: VaultSource;
};

let token: string | null = env.VITE_TMDB_API_TOKEN ?? null;

let snapshot: VaultSnapshot = {
  unlocked: Boolean(token),
  configured: Boolean(token),
  source: token ? "env" : null,
};

const listeners = new Set<() => void>();

const emit = (): void => {
  listeners.forEach((listener) => {
    listener();
  });
};

const setSnapshot = (next: VaultSnapshot): void => {
  snapshot = next;
  emit();
};

const decode = (value: Uint8Array | number[]): string =>
  new TextDecoder().decode(
    value instanceof Uint8Array ? value : Uint8Array.from(value),
  );

const encode = (value: string): number[] =>
  Array.from(new TextEncoder().encode(value));

async function loadVault(
  password: string,
): Promise<{ stronghold: Stronghold; client: Client }> {
  const vaultPath = `${await appDataDir()}/cinetrack-vault.hold`;
  const stronghold = await Stronghold.load(vaultPath, password);

  let client: Client;

  try {
    client = await stronghold.loadClient(CLIENT_NAME);
  } catch {
    client = await stronghold.createClient(CLIENT_NAME);
  }

  return {
    stronghold,
    client,
  };
}

export const tokenVault = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): VaultSnapshot {
    return snapshot;
  },

  async initialize(): Promise<void> {
    if (token) {
      return;
    }

    if (!isTauriApp()) {
      token = window.localStorage.getItem(BROWSER_KEY);

      setSnapshot({
        unlocked: Boolean(token),
        configured: Boolean(token),
        source: token ? "browser" : null,
      });
    }
  },

  async unlock(password: string): Promise<boolean> {
    if (!isTauriApp()) {
      await this.initialize();
      return Boolean(token);
    }

    const { client } = await loadVault(password);

    try {
      const stored = await client.getStore().get(TOKEN_KEY);

      if (!stored) {
        throw new Error("Token absent");
      }

      token = decode(stored);

      setSnapshot({
        unlocked: true,
        configured: Boolean(token),
        source: "vault",
      });

      return Boolean(token);
    } catch {
      token = null;

      setSnapshot({
        unlocked: true,
        configured: false,
        source: "vault",
      });

      return false;
    }
  },

  async save(password: string, value: string): Promise<void> {
    const clean = value.trim();

    if (!clean) {
      throw new Error("Le token TMDB est vide.");
    }

    if (!isTauriApp()) {
      window.localStorage.setItem(BROWSER_KEY, clean);
      token = clean;

      setSnapshot({
        unlocked: true,
        configured: true,
        source: "browser",
      });

      return;
    }

    const { stronghold, client } = await loadVault(password);

    await client.getStore().insert(TOKEN_KEY, encode(clean));
    await stronghold.save();

    token = clean;

    setSnapshot({
      unlocked: true,
      configured: true,
      source: "vault",
    });
  },

  lock(): void {
    if (snapshot.source === "env") {
      return;
    }

    token = null;

    setSnapshot({
      ...snapshot,
      unlocked: false,
    });
  },

  getToken(): string | null {
    return token;
  },
};
