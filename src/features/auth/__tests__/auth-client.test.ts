import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: {} })),
}));

async function importFresh() {
  vi.resetModules();
  return import("../auth-client");
}

describe("auth-client", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_AUTH_REQUIRED", "");
    vi.stubEnv("VITE_AUTH_OTP_LENGTH", "");
    vi.stubEnv("VITE_AUTH_OTP_RESEND_SECONDS", "");
    vi.stubEnv("VITE_AUTH_DESKTOP_REDIRECT_URL", "");
    vi.stubEnv("VITE_AUTH_WEB_REDIRECT_URL", "");
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  describe("authConfig", () => {
    it("is not configured when Supabase env vars are missing", async () => {
      const { authConfig } = await importFresh();
      expect(authConfig.configured).toBe(false);
    });

    it("is configured once both Supabase env vars are present", async () => {
      vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
      vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
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

    it("clamps otpLength to the [6, 10] range and falls back to 6 when unset or invalid", async () => {
      const { authConfig: withDefault } = await importFresh();
      expect(withDefault.otpLength).toBe(6);

      vi.stubEnv("VITE_AUTH_OTP_LENGTH", "not-a-number");
      const { authConfig: withInvalid } = await importFresh();
      expect(withInvalid.otpLength).toBe(6);

      vi.stubEnv("VITE_AUTH_OTP_LENGTH", "4");
      const { authConfig: tooLow } = await importFresh();
      expect(tooLow.otpLength).toBe(6);

      vi.stubEnv("VITE_AUTH_OTP_LENGTH", "20");
      const { authConfig: tooHigh } = await importFresh();
      expect(tooHigh.otpLength).toBe(10);

      vi.stubEnv("VITE_AUTH_OTP_LENGTH", "8");
      const { authConfig: withinRange } = await importFresh();
      expect(withinRange.otpLength).toBe(8);
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

  describe("getAuthClient", () => {
    it("returns null when Supabase isn't configured", async () => {
      const { getAuthClient } = await importFresh();
      await expect(getAuthClient()).resolves.toBeNull();
    });

    it("creates and memoizes a single client once configured", async () => {
      vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
      vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
      const { createClient } = await import("@supabase/supabase-js");
      const { getAuthClient } = await importFresh();

      const first = await getAuthClient();
      const second = await getAuthClient();

      expect(first).not.toBeNull();
      expect(first).toBe(second);
      expect(createClient).toHaveBeenCalledTimes(1);
      expect(createClient).toHaveBeenCalledWith(
        "https://example.supabase.co",
        "sb_publishable_test",
        expect.objectContaining({ auth: expect.objectContaining({ flowType: "pkce" }) })
      );
    });
  });

  describe("getAuthRedirectUrl", () => {
    it("defaults to the custom protocol callback inside a Tauri webview", async () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      const { getAuthRedirectUrl } = await importFresh();
      expect(getAuthRedirectUrl()).toBe("cinetrack://auth/callback");
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
