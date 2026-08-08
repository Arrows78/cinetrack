import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import i18next from "i18next";

import { AuthProvider } from "../auth-provider";
import { useAuth } from "../auth-context";

const onAuthStateChangeMock = vi.fn<
  (callback: (event: string, session: unknown) => void) => { data: { subscription: { unsubscribe: () => void } } }
>(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
const getSessionMock = vi.fn(
  async (): Promise<{ data: { session: unknown }; error: unknown }> => ({ data: { session: null }, error: null })
);
const signInWithOAuthMock = vi.fn();
const signInWithOtpMock = vi.fn();
const verifyOtpMock = vi.fn();
const signOutMock = vi.fn();
const exchangeCodeForSessionMock = vi.fn();

const fakeClient = {
  auth: {
    onAuthStateChange: onAuthStateChangeMock,
    getSession: getSessionMock,
    signInWithOAuth: signInWithOAuthMock,
    signInWithOtp: signInWithOtpMock,
    verifyOtp: verifyOtpMock,
    signOut: signOutMock,
    exchangeCodeForSession: exchangeCodeForSessionMock,
  },
};

let mockClient: typeof fakeClient | null = fakeClient;
let mockIsTauriRuntime = false;

vi.mock("@/features/auth/auth-client", () => ({
  authConfig: { configured: true, required: false },
  getAuthClient: () => mockClient,
  getAuthRedirectUrl: () => "https://cinetrack.app/auth/callback",
  isTauriRuntime: () => mockIsTauriRuntime,
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = fakeClient;
    mockIsTauriRuntime = false;
    onAuthStateChangeMock.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
  });

  it("starts loading and becomes ready once initialization resolves", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.session).toBeNull();
    expect(result.current.configured).toBe(true);
    expect(result.current.required).toBe(false);
  });

  it("becomes ready immediately when Supabase isn't configured", async () => {
    mockClient = null;
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.session).toBeNull();
  });

  it("populates the session from getSession() on initialization", async () => {
    const session = { user: { id: "u1", email: "a@b.com" } };
    getSessionMock.mockResolvedValue({ data: { session }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.session).toBe(session);
    expect(result.current.user).toBe(session.user);
  });

  it("surfaces a getSession() error via the error state", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: new Error("boom") });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.error).toBe("boom");
  });

  it("updates the session when the Supabase client reports an auth state change", async () => {
    let stateChangeCallback: ((event: string, session: unknown) => void) | undefined;
    onAuthStateChangeMock.mockImplementation((callback) => {
      stateChangeCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const nextSession = { user: { id: "u2" } };
    act(() => stateChangeCallback?.("SIGNED_IN", nextSession));

    await waitFor(() => expect(result.current.session).toBe(nextSession));
  });

  describe("signInWithProvider", () => {
    it("throws when Supabase isn't configured", async () => {
      mockClient = null;
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.status).toBe("ready"));

      await expect(result.current.signInWithProvider("google")).rejects.toThrow();
    });

    it("does not open a browser window outside Tauri (relies on the OAuth redirect)", async () => {
      signInWithOAuthMock.mockResolvedValue({ data: { url: "https://accounts.google.com/oauth" }, error: null });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.status).toBe("ready"));

      await act(() => result.current.signInWithProvider("google"));

      expect(signInWithOAuthMock).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          options: expect.objectContaining({ skipBrowserRedirect: false }),
        })
      );
    });

    it("rejects a non-https authorization URL inside Tauri", async () => {
      mockIsTauriRuntime = true;
      signInWithOAuthMock.mockResolvedValue({ data: { url: "http://insecure.example" }, error: null });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.status).toBe("ready"));

      await expect(result.current.signInWithProvider("google")).rejects.toThrow();
      expect(result.current.error).toBeTruthy();
    });

    it("sets the error state and rethrows when Supabase returns an OAuth error", async () => {
      signInWithOAuthMock.mockResolvedValue({ data: {}, error: new Error("oauth failed") });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.status).toBe("ready"));

      await expect(result.current.signInWithProvider("google")).rejects.toBeTruthy();
      await waitFor(() => expect(result.current.error).toBe("oauth failed"));
    });
  });

  describe("requestEmailOtp / verifyEmailOtp", () => {
    it("requests an OTP for a normalized (trimmed, lowercased) email", async () => {
      signInWithOtpMock.mockResolvedValue({ error: null });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.status).toBe("ready"));

      await act(() =>
        result.current.requestEmailOtp({
          email: "  Test@Example.com  ",
          marketingOptIn: false,
          shouldCreateUser: false,
        })
      );

      expect(signInWithOtpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          options: expect.objectContaining({ shouldCreateUser: false }),
        })
      );
    });

    it("maps a rate-limit error to the localized rate-limited message", async () => {
      signInWithOtpMock.mockResolvedValue({ error: { status: 429 } });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.status).toBe("ready"));

      await expect(
        result.current.requestEmailOtp({ email: "a@b.com", marketingOptIn: false, shouldCreateUser: false })
      ).rejects.toBeTruthy();

      await waitFor(() => expect(result.current.error).toBe(i18next.t("auth.errors.rateLimited")));
    });

    it("verifies an OTP and stores the resulting session", async () => {
      const session = { user: { id: "u3" } };
      verifyOtpMock.mockResolvedValue({ data: { session }, error: null });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.status).toBe("ready"));

      await act(() => result.current.verifyEmailOtp({ email: "a@b.com", token: "123456" }));

      expect(result.current.session).toBe(session);
    });

    it("maps an expired code error to the localized otpExpired message", async () => {
      verifyOtpMock.mockResolvedValue({ data: { session: null }, error: { code: "otp_expired" } });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.status).toBe("ready"));

      await expect(result.current.verifyEmailOtp({ email: "a@b.com", token: "000000" })).rejects.toBeTruthy();
      await waitFor(() => expect(result.current.error).toBe(i18next.t("auth.errors.otpExpired")));
    });
  });

  describe("signOut", () => {
    it("clears the session on success", async () => {
      const session = { user: { id: "u4" } };
      getSessionMock.mockResolvedValue({ data: { session }, error: null });
      signOutMock.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.session).toBe(session));

      await act(() => result.current.signOut());

      expect(result.current.session).toBeNull();
      expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
    });

    it("is a no-op when Supabase isn't configured", async () => {
      mockClient = null;
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.status).toBe("ready"));

      await act(() => result.current.signOut());

      expect(signOutMock).not.toHaveBeenCalled();
    });

    it("sets the error state and rethrows on failure", async () => {
      signOutMock.mockResolvedValue({ error: new Error("network error") });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.status).toBe("ready"));

      await expect(result.current.signOut()).rejects.toBeTruthy();
      await waitFor(() => expect(result.current.error).toBe("network error"));
    });
  });

  it("clearError() resets a previously set error", async () => {
    signInWithOtpMock.mockResolvedValue({ error: { status: 429 } });
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await expect(
      result.current.requestEmailOtp({ email: "a@b.com", marketingOptIn: false, shouldCreateUser: false })
    ).rejects.toBeTruthy();
    await waitFor(() => expect(result.current.error).toBe(i18next.t("auth.errors.rateLimited")));

    act(() => result.current.clearError());

    expect(result.current.error).toBeNull();
  });
});
