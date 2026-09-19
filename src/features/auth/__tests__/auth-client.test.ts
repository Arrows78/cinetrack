import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerkConstructorMock = vi.fn();
const clerkLoadMock = vi.fn();
const onBeforeRequestMock = vi.fn();
const onAfterResponseMock = vi.fn();

vi.mock("@clerk/clerk-js", () => ({
  Clerk: class {
    frontendApi = "test.clerk.accounts.dev";
    load = clerkLoadMock;
    __internal_onBeforeRequest = onBeforeRequestMock;
    __internal_onAfterResponse = onAfterResponseMock;
    constructor(key: string) {
      clerkConstructorMock(key);
    }
  },
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn().mockResolvedValue(new Response(null)),
}));

async function importFresh() {
  vi.resetModules();
  return import("../auth-client");
}

describe("auth-client", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_AUTH_REQUIRED", "");
    vi.stubEnv("VITE_AUTH_OTP_RESEND_SECONDS", "");
    vi.stubEnv("VITE_AUTH_DESKTOP_REDIRECT_URL", "");
    vi.stubEnv("VITE_AUTH_WEB_REDIRECT_URL", "");
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    clerkConstructorMock.mockClear();
    clerkLoadMock.mockReset().mockResolvedValue(undefined);
    onBeforeRequestMock.mockClear();
    onAfterResponseMock.mockClear();
    window.localStorage.removeItem("cinetrack.clerk.clientJwt");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  describe("authConfig", () => {
    it("is not configured when the Clerk publishable key is missing", async () => {
      const { authConfig } = await importFresh();
      expect(authConfig.configured).toBe(false);
    });

    it("is configured once the Clerk publishable key is present", async () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
      const { authConfig } = await importFresh();
      expect(authConfig.configured).toBe(true);
    });

    it("defaults required to false when VITE_AUTH_REQUIRED is unset", async () => {
      const { authConfig } = await importFresh();
      expect(authConfig.required).toBe(false);
    });

    it("is required only when VITE_AUTH_REQUIRED is exactly 'true'", async () => {
      vi.stubEnv("VITE_AUTH_REQUIRED", "yes");
      const { authConfig: notRequired } = await importFresh();
      expect(notRequired.required).toBe(false);

      vi.stubEnv("VITE_AUTH_REQUIRED", "true");
      const { authConfig: required } = await importFresh();
      expect(required.required).toBe(true);
    });

    it("always reports otpLength as 6 — Clerk's fixed email-code length", async () => {
      const { authConfig } = await importFresh();
      expect(authConfig.otpLength).toBe(6);
    });

    it("clamps otpResendSeconds to the [30, 300] range and falls back to 60 when unset", async () => {
      const { authConfig } = await importFresh();
      expect(authConfig.otpResendSeconds).toBe(60);

      vi.stubEnv("VITE_AUTH_OTP_RESEND_SECONDS", "1");
      const { authConfig: tooLow } = await importFresh();
      expect(tooLow.otpResendSeconds).toBe(30);

      vi.stubEnv("VITE_AUTH_OTP_RESEND_SECONDS", "10000");
      const { authConfig: tooHigh } = await importFresh();
      expect(tooHigh.otpResendSeconds).toBe(300);
    });

    it("leaves termsUrl/privacyUrl undefined when blank", async () => {
      vi.stubEnv("VITE_TERMS_URL", "   ");
      const { authConfig } = await importFresh();
      expect(authConfig.termsUrl).toBeUndefined();
    });
  });

  describe("bootstrapClerkInstance / getClerkInstance", () => {
    it("resolves to null and never constructs Clerk when unconfigured", async () => {
      const { bootstrapClerkInstance, getClerkInstance } = await importFresh();
      await expect(bootstrapClerkInstance()).resolves.toBeNull();
      expect(getClerkInstance()).toBeNull();
      expect(clerkConstructorMock).not.toHaveBeenCalled();
    });

    it("constructs and memoizes a single Clerk instance once configured", async () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
      const { bootstrapClerkInstance, getClerkInstance } = await importFresh();

      const first = await bootstrapClerkInstance();
      const second = await bootstrapClerkInstance();

      expect(first).not.toBeNull();
      expect(first).toBe(second);
      expect(getClerkInstance()).toBe(first);
      expect(clerkConstructorMock).toHaveBeenCalledTimes(1);
      expect(clerkConstructorMock).toHaveBeenCalledWith("pk_test_example");
      expect(clerkLoadMock).toHaveBeenCalledWith({ standardBrowser: true });
      expect(onBeforeRequestMock).not.toHaveBeenCalled();
    });

    it("does not patch fetch outside a Tauri webview", async () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
      const originalFetch = window.fetch;
      const { bootstrapClerkInstance } = await importFresh();
      await bootstrapClerkInstance();
      expect(window.fetch).toBe(originalFetch);
    });

    it("inside a Tauri webview: routes only Frontend-API-host fetches through the Tauri http plugin", async () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
      const originalFetch = window.fetch;
      const browserFetchSpy = vi.fn().mockResolvedValue(new Response(null));
      window.fetch = browserFetchSpy as typeof window.fetch;
      const { bootstrapClerkInstance } = await importFresh();

      await bootstrapClerkInstance();
      expect(window.fetch).not.toBe(browserFetchSpy);
      expect(clerkLoadMock).toHaveBeenCalledWith({ standardBrowser: false });
      expect(onBeforeRequestMock).toHaveBeenCalledTimes(1);
      expect(onAfterResponseMock).toHaveBeenCalledTimes(1);

      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      await window.fetch("https://test.clerk.accounts.dev/v1/environment");
      expect(tauriFetch).toHaveBeenCalledWith(
        "https://test.clerk.accounts.dev/v1/environment?_is_native=1",
        expect.objectContaining({ credentials: "omit" })
      );
      expect(new Headers((tauriFetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.headers).get("Origin")).toBe("");
      expect(browserFetchSpy).not.toHaveBeenCalled();

      await window.fetch("https://api.themoviedb.org/3/movie/1");
      expect(tauriFetch).toHaveBeenCalledTimes(1);
      expect(browserFetchSpy).toHaveBeenCalledWith("https://api.themoviedb.org/3/movie/1", undefined);

      await window.fetch(new URL("https://test.clerk.accounts.dev/v1/client"));
      expect(tauriFetch).toHaveBeenCalledTimes(2);
      expect(tauriFetch).toHaveBeenLastCalledWith(
        "https://test.clerk.accounts.dev/v1/client?_is_native=1",
        expect.objectContaining({ credentials: "omit" })
      );

      await window.fetch(
        new Request("https://test.clerk.accounts.dev/v1/environment", {
          method: "POST",
          headers: { Authorization: "Bearer cached-client-jwt" },
        })
      );
      expect(tauriFetch).toHaveBeenCalledTimes(3);
      expect((tauriFetch as ReturnType<typeof vi.fn>).mock.calls[2]?.[0]).toBe(
        "https://test.clerk.accounts.dev/v1/environment?_is_native=1"
      );
      const forwarded = (tauriFetch as ReturnType<typeof vi.fn>).mock.calls[2]?.[1] as RequestInit | undefined;
      expect(forwarded?.method).toBe("POST");
      expect(new Headers(forwarded?.headers).get("Authorization")).toBe("Bearer cached-client-jwt");

      window.fetch = originalFetch;
    });

    it("inside a Tauri webview: persists and reattaches the FAPI client JWT", async () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
      window.localStorage.setItem("cinetrack.clerk.clientJwt", "cached-client-jwt");

      let beforeRequest: ((request: { headers?: HeadersInit; credentials?: RequestCredentials; url?: URL }) => void) | undefined;
      let afterResponse: ((_request: unknown, response: Response) => void) | undefined;
      onBeforeRequestMock.mockImplementation((callback: typeof beforeRequest) => {
        beforeRequest = callback;
      });
      onAfterResponseMock.mockImplementation((callback: typeof afterResponse) => {
        afterResponse = callback;
      });

      const { bootstrapClerkInstance } = await importFresh();
      await bootstrapClerkInstance();

      const request: { headers?: HeadersInit; credentials?: RequestCredentials; url: URL } = {
        headers: {},
        url: new URL("https://test.clerk.accounts.dev/v1/client"),
      };
      beforeRequest?.(request);
      expect(request.credentials).toBe("omit");
      expect(request.url.searchParams.get("_is_native")).toBe("1");
      expect(new Headers(request.headers).get("Authorization")).toBe("Bearer cached-client-jwt");

      afterResponse?.(undefined, new Response(null, { headers: { authorization: "Bearer fresh-client-jwt" } }));
      expect(window.localStorage.getItem("cinetrack.clerk.clientJwt")).toBe("fresh-client-jwt");
    });

    it("resolves to null and logs when constructing Clerk throws", async () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
      clerkConstructorMock.mockImplementation(() => {
        throw new Error("boom");
      });
      const { bootstrapClerkInstance, getClerkInstance } = await importFresh();

      await expect(bootstrapClerkInstance()).resolves.toBeNull();
      expect(getClerkInstance()).toBeNull();
    });
  });

  describe("getAuthRedirectUrl", () => {
    it("defaults to the loopback callback inside a desktop Tauri webview", async () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      const { DESKTOP_OAUTH_LOOPBACK_URL, getAuthRedirectUrl } = await importFresh();
      expect(getAuthRedirectUrl()).toBe(DESKTOP_OAUTH_LOOPBACK_URL);
    });

    it("defaults to the custom protocol on a mobile Tauri user agent", async () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      const userAgent = vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("iPhone");
      const { getAuthRedirectUrl } = await importFresh();
      expect(getAuthRedirectUrl()).toBe("cinetrack://auth/callback");
      userAgent.mockRestore();
    });

    it("honors VITE_AUTH_DESKTOP_REDIRECT_URL inside a Tauri webview", async () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      vi.stubEnv("VITE_AUTH_DESKTOP_REDIRECT_URL", "cinetrack://custom/callback");
      const { getAuthRedirectUrl } = await importFresh();
      expect(getAuthRedirectUrl()).toBe("cinetrack://custom/callback");
    });

    it("defaults to the current origin in a browser context", async () => {
      const { getAuthRedirectUrl } = await importFresh();
      expect(getAuthRedirectUrl()).toBe(`${window.location.origin}/`);
    });

    it("honors VITE_AUTH_WEB_REDIRECT_URL in a browser context", async () => {
      vi.stubEnv("VITE_AUTH_WEB_REDIRECT_URL", "https://cinetrack.app/callback");
      const { getAuthRedirectUrl } = await importFresh();
      expect(getAuthRedirectUrl()).toBe("https://cinetrack.app/callback");
    });
  });
});
