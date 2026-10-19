import i18n from "@/i18n";
import { env } from "@/shared/config/env";
import { defineCommand, invokeTypedCommand } from "@/shared/lib/invoke";
import { isTauriApp } from "@/shared/lib/platform";
import { errorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";
import { tokenVault } from "@/features/desktop";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConfigurationError";
  }
}

export class TmdbRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "TmdbRequestError";
  }
}

// Shape of the Err(TmdbError) the Rust `tmdb_request` command serializes over
// IPC (see src-tauri/src/integrations/tmdb/) — invoke() rejects with this
// object directly, no string parsing needed.
interface StructuredTmdbError {
  message: string;
  status?: number;
}

// No token in the request: the Rust side holds it (see `ensureNativeToken`), so it does not
// cross the IPC boundary with every call.
type TmdbRequestArgs = {
  path: string;
  params: Record<string, string>;
};

type SetTmdbTokenArgs = {
  token: string | null;
};

const tmdbCommands = {
  request: defineCommand<TmdbRequestArgs, unknown>("tmdb_request"),
  setToken: defineCommand<SetTmdbTokenArgs, void>("set_tmdb_token"),
} as const;

const isStructuredTmdbError = (error: unknown): error is StructuredTmdbError =>
  typeof error === "object" &&
  error !== null &&
  "message" in error &&
  typeof (error as { message: unknown }).message === "string";

const asTmdbError = (error: unknown): TmdbRequestError => {
  if (error instanceof TmdbRequestError) return error;
  if (isStructuredTmdbError(error)) return new TmdbRequestError(error.message, error.status);
  return new TmdbRequestError(errorMessage(error));
};

const isAuthenticationError = (error: TmdbRequestError): boolean => error.status === 401 || error.status === 403;

// Matches the 20s total timeout the Rust native transport already enforces
// (see src-tauri/src/integrations/tmdb/client.rs), so a hung TMDB request
// fails the same way regardless of which transport handled it.
const WEBVIEW_REQUEST_TIMEOUT_MS = 20_000;

const fetchFromWebview = async <T>(path: string, params: Record<string, string>, bearer: string): Promise<T> => {
  const url = new URL(`${TMDB_BASE_URL}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBVIEW_REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new TmdbRequestError(i18n.t("errors.tmdbTimeout", { seconds: WEBVIEW_REQUEST_TIMEOUT_MS / 1000, path }));
    }

    throw new TmdbRequestError(i18n.t("errors.tmdbUnreachable", { details: errorMessage(error) }));
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new TmdbRequestError(`TMDB ${response.status}: ${await response.text()}`, response.status);
  }

  return response.json() as Promise<T>;
};

// What the Rust side is known to hold as the TMDB token (null: nothing, undefined: not known
// yet). Calls are chained so two requests racing with a token change cannot leave an older
// token stored last.
let nativeToken: string | null | undefined;
let nativeTokenSync: Promise<unknown> = Promise.resolve();

/** Hands the vault's token to the Rust side once, and again only when it changes. */
const ensureNativeToken = (bearer: string | null): Promise<void> => {
  const sync = nativeTokenSync.then(async () => {
    if (nativeToken === bearer) return;
    await invokeTypedCommand(tmdbCommands.setToken, { token: bearer });
    nativeToken = bearer;
  });
  // The failure goes to this call's own caller through `sync`; the chain only has to keep going.
  nativeTokenSync = sync.then(
    () => undefined,
    () => undefined
  );
  return sync;
};

/** Forgets what the Rust side holds, so the next native request sends the current token again. */
export const resetNativeTokenSync = (): void => {
  nativeToken = undefined;
  nativeTokenSync = Promise.resolve();
};

const fetchFromNative = async <T>(path: string, params: Record<string, string>, bearer: string): Promise<T> => {
  try {
    await ensureNativeToken(bearer);
    const result = await invokeTypedCommand(tmdbCommands.request, { path, params });
    return result as T;
  } catch (error) {
    throw asTmdbError(error);
  }
};

export async function tmdbFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  await tokenVault.initialize();

  const cleanParams = Object.fromEntries(
    Object.entries(params ?? {})
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)])
  );

  const bearer = tokenVault.getToken() ?? env.VITE_TMDB_API_TOKEN ?? null;

  if (!bearer) {
    throw new ApiConfigurationError(i18n.t("errors.tmdbNoToken"));
  }

  // Timed from here, not from the top of this function — token-vault setup
  // is one-time overhead unrelated to this specific request's latency. No
  // `cache=` marker: there's no response cache for TMDB JSON payloads in
  // this codebase to report on (TanStack Query's own cache is opaque from
  // here, and image-cache.ts is unrelated — it only covers poster/backdrop
  // bytes, not API responses), so a cache marker would just be fabricated.
  const startedAt = performance.now();
  const logDuration = (status?: "error") => {
    const duration = Math.round(performance.now() - startedAt);
    logger.info(`tmdb=${path} duration=${duration}ms${status ? ` status=${status}` : ""}`);
  };

  if (!isTauriApp()) {
    try {
      const result = await fetchFromWebview<T>(path, cleanParams, bearer);
      logDuration();
      return result;
    } catch (error) {
      logDuration("error");
      throw error;
    }
  }

  try {
    const result = await fetchFromNative<T>(path, cleanParams, bearer);
    logDuration();
    return result;
  } catch (error) {
    const nativeError = asTmdbError(error);

    if (isAuthenticationError(nativeError)) {
      tokenVault.lock();
      // The rejected token must not stay on the Rust side either.
      ensureNativeToken(null).catch((clearError: unknown) => {
        logger.warn(`Could not clear the TMDB token held by the backend: ${errorMessage(clearError)}`);
      });
    }

    logDuration("error");
    throw nativeError;
  }
}
