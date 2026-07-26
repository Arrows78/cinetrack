import { invoke } from "@tauri-apps/api/core";

import { env } from "@/shared/config/env";
import { isTauriApp } from "@/shared/lib/platform";
import { tokenVault } from "@/services/token-vault";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

type DesktopTransport = "native" | "webview";

let desktopTransport: DesktopTransport = "native";

export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConfigurationError";
  }
}

export class TmdbRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TmdbRequestError";
  }
}

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const statusFromMessage = (message: string): number | undefined => {
  const match = message.match(/TMDB\s+(\d{3})/i);
  return match ? Number(match[1]) : undefined;
};

const asTmdbError = (error: unknown): TmdbRequestError => {
  const message = errorMessage(error);
  return new TmdbRequestError(message, statusFromMessage(message));
};

const isAuthenticationError = (error: TmdbRequestError): boolean =>
  error.status === 401 || error.status === 403;

const fetchFromWebview = async <T>(
  path: string,
  params: Record<string, string>,
  bearer: string,
): Promise<T> => {
  const url = new URL(`${TMDB_BASE_URL}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${bearer}`,
      },
    });
  } catch (error) {
    throw new TmdbRequestError(
      `Impossible de joindre TMDB depuis la WebView : ${errorMessage(error)}`,
    );
  }

  if (!response.ok) {
    throw new TmdbRequestError(
      `TMDB ${response.status}: ${await response.text()}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
};

const fetchFromNative = async <T>(
  path: string,
  params: Record<string, string>,
  bearer: string,
): Promise<T> => {
  try {
    return await invoke<T>("tmdb_request", {
      path,
      params,
      token: bearer,
    });
  } catch (error) {
    throw asTmdbError(error);
  }
};

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

  const bearer = tokenVault.getToken() ?? env.VITE_TMDB_API_TOKEN ?? null;

  if (!bearer) {
    throw new ApiConfigurationError(
      "Aucun token TMDB disponible. Déverrouille le coffre TMDB dans les paramètres.",
    );
  }

  if (!isTauriApp()) {
    return fetchFromWebview<T>(path, cleanParams, bearer);
  }

  try {
    if (desktopTransport === "webview") {
      return await fetchFromWebview<T>(path, cleanParams, bearer);
    }

    return await fetchFromNative<T>(path, cleanParams, bearer);
  } catch (error) {
    const nativeError = asTmdbError(error);

    if (isAuthenticationError(nativeError)) {
      tokenVault.lock();
      throw nativeError;
    }

    if (nativeError.status !== undefined || desktopTransport === "webview") {
      throw nativeError;
    }

    console.warn(
      `[TMDB] Le transport Rust a échoué pour ${path}; bascule vers fetch dans la WebView.`,
      nativeError,
    );

    desktopTransport = "webview";

    try {
      return await fetchFromWebview<T>(path, cleanParams, bearer);
    } catch (fallbackError) {
      const webviewError = asTmdbError(fallbackError);

      if (isAuthenticationError(webviewError)) {
        tokenVault.lock();
      }

      throw new TmdbRequestError(
        `La connexion TMDB a échoué via le backend desktop (${nativeError.message}) puis via la WebView (${webviewError.message}).`,
        webviewError.status,
      );
    }
  }
}
