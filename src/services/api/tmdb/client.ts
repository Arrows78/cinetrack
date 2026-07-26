import { invoke } from "@tauri-apps/api/core";

import { env } from "@/shared/config/env";
import { isTauriApp } from "@/shared/lib/platform";
import { tokenVault } from "@/services/token-vault";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConfigurationError";
  }
}

export async function tmdbFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  await tokenVault.initialize();

  const cleanParams = Object.fromEntries(
    Object.entries(params ?? {})
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );

  const bearer =
    tokenVault.getToken() ?? env.VITE_TMDB_API_TOKEN ?? null;

  const tauri = isTauriApp();

  console.info("[TMDB request]", {
    path,
    tauri,
    hasToken: Boolean(bearer),
    params: cleanParams,
  });

  if (!bearer) {
    throw new ApiConfigurationError(
      "Aucun token TMDB disponible. Déverrouille le coffre TMDB dans les paramètres.",
    );
  }

  if (tauri) {
    try {
      return await invoke<T>("tmdb_request", {
        path,
        params: cleanParams,
        token: bearer,
      });
    } catch (error) {
      console.error("[TMDB invoke error]", path, error);
      throw error;
    }
  }

  const url = new URL(`${TMDB_BASE_URL}${path}`);

  Object.entries(cleanParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${bearer}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `TMDB ${response.status}: ${await response.text()}`,
    );
  }

  return response.json() as Promise<T>;
}
