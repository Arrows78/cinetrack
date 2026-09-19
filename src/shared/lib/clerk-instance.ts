import type { Clerk as ClerkClass } from "@clerk/clerk-js";

import { isTauriApp } from "@/shared/lib/platform";
import { logger } from "@/shared/lib/logger";

// Lives in shared/lib, not features/auth, because the shared Supabase data
// client (supabase-data-client.ts, this file's sibling) needs the current
// Clerk instance/user id too — shared/lib must not depend on any feature
// (see docs/architecture.md's "Architecture boundaries"), so this can't sit
// inside features/auth even though it's conceptually that feature's
// concern. features/auth/auth-client.ts re-exports everything here for
// that feature's own call sites.
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();

export const clerkConfig = {
  configured: Boolean(clerkPublishableKey),
};

let clerkInstance: ClerkClass | null = null;
let bootstrapPromise: Promise<ClerkClass | null> | null = null;

const CLIENT_JWT_STORAGE_KEY = "cinetrack.clerk.clientJwt";

// Expo-style native session persistence. `standardBrowser: false` stops
// clerk-js from relying on cookies, but it does not persist or re-attach the
// long-lived `__client` JWT by itself — without this, the next FAPI session
// touch is anonymous, 401s, and Clerk signs the user out. Scoped to Tauri:
// a real browser already has working cookies, and sending Authorization
// *and* Origin from a tab trips `origin_authorization_headers_conflict`.
type NativeFapiRequest = {
  credentials?: RequestCredentials;
  url?: URL;
  headers?: HeadersInit;
};

type NativeClerkHooks = ClerkClass & {
  __internal_onBeforeRequest?: (callback: (request: NativeFapiRequest) => void) => void;
  __internal_onAfterResponse?: (callback: (request: unknown, response?: Response) => void) => void;
};

// Same hooks as `@clerk/electron`: development instances refuse a webview
// that cannot hold Clerk's first-party cookies ("Unable to authenticate
// this browser for your development instance"). `_is_native=1` tells FAPI
// this is a native client so it issues a `__client` JWT instead.
function attachNativeTokenCache(clerk: ClerkClass): void {
  const nativeClerk = clerk as NativeClerkHooks;

  nativeClerk.__internal_onBeforeRequest?.((request) => {
    request.credentials = "omit";
    request.url?.searchParams.set("_is_native", "1");

    const token = window.localStorage.getItem(CLIENT_JWT_STORAGE_KEY);
    if (!token) return;

    const headers = new Headers(request.headers);
    headers.delete("Origin");
    headers.delete("Referer");
    headers.set("Authorization", `Bearer ${token}`);
    request.headers = headers;
  });

  nativeClerk.__internal_onAfterResponse?.((_request, response) => {
    const header = response?.headers.get("authorization") ?? response?.headers.get("Authorization");
    if (!header) return;

    window.localStorage.setItem(CLIENT_JWT_STORAGE_KEY, header.replace(/^Bearer\s+/i, ""));
  });
}

// Clerk's Frontend API (FAPI) rejects a request that carries both an
// `Origin` header (added automatically by any real browser/webview fetch)
// and an `Authorization` header (added by clerk-js itself once a client
// token exists) with `origin_authorization_headers_conflict` — this is
// exactly the combination Tauri's WKWebView/WebView2 produces for every
// FAPI call once a session exists. `@tauri-apps/plugin-http`'s `fetch`
// bypasses the webview entirely (the request runs through Rust's reqwest
// client via IPC, which never adds a browser `Origin` header), so FAPI
// traffic is routed through it instead of the webview's real `fetch` —
// scoped strictly to the Clerk FAPI host, every other `fetch` call in the
// app (TMDB, Supabase Postgres/Realtime) keeps using the webview's own
// implementation untouched.
function isClerkFrontendApiUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("clerk.accounts.dev");
  } catch {
    return false;
  }
}

function initFromFetchInput(input: RequestInfo | URL, init?: RequestInit): RequestInit {
  if (!(input instanceof Request)) {
    return init ?? {};
  }

  const headers = new Headers(input.headers);

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return {
    ...init,
    method: init?.method ?? input.method,
    headers,
    body: init?.body ?? input.body,
  };
}

// tauri-plugin-http (even without a browser Origin) injects the webview
// origin unless `unsafe-headers` is on and Origin is the empty string —
// see src-tauri/Cargo.toml. Clerk then sees Origin + Authorization.
function nativeFapiInit(input: RequestInfo | URL, init?: RequestInit): RequestInit {
  const base = initFromFetchInput(input, init);
  const headers = new Headers(base.headers);
  headers.delete("Referer");
  headers.delete("Referrer");
  headers.set("Origin", "");

  return {
    ...base,
    headers,
    credentials: "omit",
  };
}

async function patchFetchForFrontendApi(): Promise<void> {
  if (!isTauriApp()) return;

  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const browserFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();

    if (isClerkFrontendApiUrl(url)) {
      // clerk-js often calls `fetch(request)` with headers/body only on the
      // Request. plugin-http's fetch does not read those off a Request object
      // the way the webview does — passing just the URL drops Authorization
      // and the JSON body, load() 401s, and ClerkProvider falls back to a
      // CDN script that CSP (`script-src 'self'`) then blocks forever.
      // `_is_native=1` is also stamped here so a FAPI call that skipped the
      // Clerk hook still avoids the development-instance cookie handshake.
      const nativeUrl = new URL(url);
      nativeUrl.searchParams.set("_is_native", "1");
      return tauriFetch(nativeUrl.toString(), nativeFapiInit(input, init)).then((response) => {
        const header = response.headers.get("authorization") ?? response.headers.get("Authorization");
        if (header) {
          window.localStorage.setItem(CLIENT_JWT_STORAGE_KEY, header.replace(/^Bearer\s+/i, ""));
        }
        return response;
      });
    }

    return browserFetch(input, init);
  }) as typeof window.fetch;
}

// Dynamically imported: @clerk/clerk-js is a large dependency that a build
// with auth unconfigured should never have to fetch at all — same
// reasoning as @supabase/supabase-js before it (see auth-client.ts's git
// history). Bundled via npm, not hot-loaded from Clerk's CDN:
// tauri.conf.json's `script-src 'self'` only allows this because clerk-js
// ships as part of this app's own Vite bundle instead of a separately
// injected <script> tag.
//
// Awaited once in main.tsx, before the app's first render (same idiom as
// i18nReady) — every consumer after that point (getClerkInstance() below,
// ClerkAppProvider) reads the already-resolved module-level instance
// synchronously rather than re-awaiting this promise, so a background
// caller (e.g. the sync engine's periodic timer) never has to know whether
// bootstrapping already happened.
export function bootstrapClerkInstance(): Promise<ClerkClass | null> {
  bootstrapPromise ??= (async () => {
    if (!clerkConfig.configured || !clerkPublishableKey) return null;

    try {
      const nativeWebview = isTauriApp();

      // Patch before `new Clerk()`: clerk-js captures `window.fetch` during
      // construction. Patching after that leaves FAPI on the webview fetch
      // (Origin set) while the native hook still adds Authorization.
      if (nativeWebview) {
        await patchFetchForFrontendApi();
      }

      const { Clerk } = await import("@clerk/clerk-js");
      const clerk = new Clerk(clerkPublishableKey);

      if (nativeWebview) {
        attachNativeTokenCache(clerk);
      }

      // Publish the instance before load() so ClerkProvider can still take
      // the headless path if FAPI fails on this first attempt (a null
      // instance makes @clerk/react inject a CDN <script>, which our CSP
      // never allows — AuthGate then sits on "Restoring your session…").
      clerkInstance = clerk;
      await clerk.load({ standardBrowser: !nativeWebview });
      return clerk;
    } catch (error) {
      logger.error(`Clerk bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  })();

  return bootstrapPromise;
}

/** Synchronous accessor — safe once bootstrapClerkInstance() has resolved (see its doc comment). */
export function getClerkInstance(): ClerkClass | null {
  return clerkInstance;
}
