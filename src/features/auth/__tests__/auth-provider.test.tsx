import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import i18next from "i18next";
// Side-effect import: initializes the shared i18next singleton with real
// resources (auth-provider.tsx calls `i18next.t(...)` directly, bypassing
// this module) — without it every `t()` call in this file, app-side and
// test-side alike, silently returns `undefined` instead of a real string.
import "@/i18n";

import { AuthProvider } from "../auth-provider";
import { useAuth } from "../use-auth";

const useSessionMock = vi.fn();
const useUserMock = vi.fn();
const useSignInMock = vi.fn();
const useSignUpMock = vi.fn();

vi.mock("@clerk/react", () => ({
  useSession: () => useSessionMock(),
  useUser: () => useUserMock(),
}));
vi.mock("@clerk/react/legacy", () => ({
  useSignIn: () => useSignInMock(),
  useSignUp: () => useSignUpMock(),
}));

const signInMock = {
  create: vi.fn(),
  prepareFirstFactor: vi.fn(),
  attemptFirstFactor: vi.fn(),
  authenticateWithRedirect: vi.fn(),
};
const signUpMock = {
  create: vi.fn(),
  prepareEmailAddressVerification: vi.fn(),
  attemptEmailAddressVerification: vi.fn(),
};

const setActiveMock = vi.fn();
const signOutMock = vi.fn();
const handleRedirectCallbackMock = vi.fn();

let mockClerkInstance: {
  client: { signIn: typeof signInMock; signUp: typeof signUpMock } | undefined;
  setActive: typeof setActiveMock;
  signOut: typeof signOutMock;
  handleRedirectCallback: typeof handleRedirectCallbackMock;
} | null;

let mockIsTauriApp = false;
let mockRedirectUrl = "https://cinetrack.app/auth/callback";

vi.mock("@/features/auth/auth-client", () => ({
  authConfig: { configured: true, required: false },
  getClerkInstance: () => mockClerkInstance,
  getAuthRedirectUrl: () => mockRedirectUrl,
}));

vi.mock("@/shared/lib/platform", () => ({
  isTauriApp: () => mockIsTauriApp,
}));

// Without this, the init effect's Tauri branch calls the real plugin, which
// throws outside an actual Tauri webview.
vi.mock("@tauri-apps/plugin-deep-link", () => ({
  onOpenUrl: vi.fn(async () => () => undefined),
  getCurrent: vi.fn(async () => null),
}));

const listenMock = vi.fn(async () => () => undefined);
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

const openUrlMock = vi.fn();
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (...args: unknown[]) => openUrlMock(...args),
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
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    vi.clearAllMocks();
    mockIsTauriApp = false;
    mockRedirectUrl = "https://cinetrack.app/auth/callback";
    useSessionMock.mockReturnValue({ isLoaded: true, isSignedIn: false, session: null });
    useUserMock.mockReturnValue({ isLoaded: true, isSignedIn: false, user: null });
    useSignInMock.mockReturnValue({ isLoaded: true, signIn: signInMock, setActive: setActiveMock });
    useSignUpMock.mockReturnValue({ isLoaded: true, signUp: signUpMock, setActive: setActiveMock });
    mockClerkInstance = {
      client: { signIn: signInMock, signUp: signUpMock },
      setActive: setActiveMock,
      signOut: signOutMock,
      handleRedirectCallback: handleRedirectCallbackMock,
    };
    handleRedirectCallbackMock.mockResolvedValue(undefined);
  });

  it("starts loading and becomes ready once Clerk reports isLoaded, or immediately when unconfigured", async () => {
    useSessionMock.mockReturnValue({ isLoaded: false, isSignedIn: undefined, session: undefined });
    const { result, rerender } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    expect(result.current.status).toBe("loading");

    useSessionMock.mockReturnValue({ isLoaded: true, isSignedIn: false, session: null });
    rerender();

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.session).toBeNull();
    expect(result.current.configured).toBe(true);
    expect(result.current.required).toBe(false);
  });

  it("outside Tauri: calls Clerk's handleRedirectCallback on init and swallows a rejection", async () => {
    handleRedirectCallbackMock.mockImplementation(async (_params, customNavigate?: () => Promise<void>) => {
      await customNavigate?.();
      throw new Error("nothing pending");
    });
    renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => expect(handleRedirectCallbackMock).toHaveBeenCalledWith({}, expect.any(Function)));
  });

  it("reflects the session/user Clerk's own hooks report", async () => {
    const session = { id: "sess_1", user: { id: "user_1" } };
    useSessionMock.mockReturnValue({ isLoaded: true, isSignedIn: true, session });
    useUserMock.mockReturnValue({ isLoaded: true, isSignedIn: true, user: session.user });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.session).toBe(session);
    expect(result.current.user).toBe(session.user);
  });

  describe("requestEmailOtp / verifyEmailOtp", () => {
    it("throws when Clerk isn't loaded", async () => {
      useSignInMock.mockReturnValue({ isLoaded: false, signIn: undefined, setActive: undefined });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await expect(
        result.current.requestEmailOtp({ email: "a@b.com", marketingOptIn: false, shouldCreateUser: false })
      ).rejects.toThrow();
    });

    it("sign-in: creates the attempt with the normalized identifier and prepares the email_code factor", async () => {
      signInMock.create.mockResolvedValue({
        supportedFirstFactors: [{ strategy: "email_code", emailAddressId: "idn_1" }],
      });
      signInMock.prepareFirstFactor.mockResolvedValue({});
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await act(() =>
        result.current.requestEmailOtp({
          email: "  Test@Example.com  ",
          marketingOptIn: false,
          shouldCreateUser: false,
        })
      );

      expect(signInMock.create).toHaveBeenCalledWith({ identifier: "test@example.com" });
      expect(signInMock.prepareFirstFactor).toHaveBeenCalledWith({ strategy: "email_code", emailAddressId: "idn_1" });
    });

    it("sign-in: rejects with noAccount when the identifier supports no email_code factor", async () => {
      signInMock.create.mockResolvedValue({ supportedFirstFactors: [{ strategy: "password" }] });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await expect(
        result.current.requestEmailOtp({ email: "a@b.com", marketingOptIn: false, shouldCreateUser: false })
      ).rejects.toBeTruthy();

      await waitFor(() => expect(result.current.error).toBe(i18next.t("auth.errors.noAccount")));
      expect(signInMock.prepareFirstFactor).not.toHaveBeenCalled();
    });

    it("sign-up: creates the sign-up with marketing opt-in metadata and prepares email verification", async () => {
      signUpMock.create.mockResolvedValue({});
      signUpMock.prepareEmailAddressVerification.mockResolvedValue({});
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await act(() =>
        result.current.requestEmailOtp({ email: "a@b.com", marketingOptIn: true, shouldCreateUser: true })
      );

      expect(signUpMock.create).toHaveBeenCalledWith({
        emailAddress: "a@b.com",
        unsafeMetadata: { marketing_opt_in: true },
      });
      expect(signUpMock.prepareEmailAddressVerification).toHaveBeenCalledWith({ strategy: "email_code" });
    });

    it("maps a rate-limit error to the localized rate-limited message", async () => {
      signInMock.create.mockRejectedValue({ status: 429, errors: [{ code: "too_many_requests" }] });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await expect(
        result.current.requestEmailOtp({ email: "a@b.com", marketingOptIn: false, shouldCreateUser: false })
      ).rejects.toBeTruthy();

      await waitFor(() => expect(result.current.error).toBe(i18next.t("auth.errors.rateLimited")));
    });

    it("maps form_identifier_exists to the accountExists message", async () => {
      signUpMock.create.mockRejectedValue({ errors: [{ code: "form_identifier_exists" }] });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await expect(
        result.current.requestEmailOtp({ email: "a@b.com", marketingOptIn: false, shouldCreateUser: true })
      ).rejects.toBeTruthy();

      await waitFor(() => expect(result.current.error).toBe(i18next.t("auth.errors.accountExists")));
    });

    it("verifies a sign-in email code and activates the resulting session", async () => {
      signInMock.create.mockResolvedValue({
        supportedFirstFactors: [{ strategy: "email_code", emailAddressId: "idn_1" }],
      });
      signInMock.prepareFirstFactor.mockResolvedValue({});
      signInMock.attemptFirstFactor.mockResolvedValue({ createdSessionId: "sess_1" });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await act(() =>
        result.current.requestEmailOtp({ email: "a@b.com", marketingOptIn: false, shouldCreateUser: false })
      );
      await act(() => result.current.verifyEmailOtp({ email: "a@b.com", token: "123456" }));

      expect(signInMock.attemptFirstFactor).toHaveBeenCalledWith({ strategy: "email_code", code: "123456" });
      expect(setActiveMock).toHaveBeenCalledWith({ session: "sess_1" });
    });

    it("verifies a sign-up email code and activates the resulting session", async () => {
      signUpMock.create.mockResolvedValue({});
      signUpMock.prepareEmailAddressVerification.mockResolvedValue({});
      signUpMock.attemptEmailAddressVerification.mockResolvedValue({ createdSessionId: "sess_2" });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await act(() =>
        result.current.requestEmailOtp({ email: "a@b.com", marketingOptIn: false, shouldCreateUser: true })
      );
      await act(() => result.current.verifyEmailOtp({ email: "a@b.com", token: "654321" }));

      expect(signUpMock.attemptEmailAddressVerification).toHaveBeenCalledWith({ code: "654321" });
      expect(setActiveMock).toHaveBeenCalledWith({ session: "sess_2" });
    });

    it("maps a server-side form_identifier_not_found error to the localized noAccount message", async () => {
      signInMock.create.mockRejectedValue({ errors: [{ code: "form_identifier_not_found" }] });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await expect(
        result.current.requestEmailOtp({ email: "a@b.com", marketingOptIn: false, shouldCreateUser: false })
      ).rejects.toBeTruthy();

      await waitFor(() => expect(result.current.error).toBe(i18next.t("auth.errors.noAccount")));
    });

    it("maps a verification_expired error to the localized otpExpired message", async () => {
      signInMock.create.mockRejectedValue({ errors: [{ code: "verification_expired" }] });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await expect(
        result.current.requestEmailOtp({ email: "a@b.com", marketingOptIn: false, shouldCreateUser: false })
      ).rejects.toBeTruthy();

      await waitFor(() => expect(result.current.error).toBe(i18next.t("auth.errors.otpExpired")));
    });

    it("maps form_param_format_invalid to the localized invalidEmail message", async () => {
      signInMock.create.mockRejectedValue({ errors: [{ code: "form_param_format_invalid" }] });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await expect(
        result.current.requestEmailOtp({ email: "a@b.com", marketingOptIn: false, shouldCreateUser: false })
      ).rejects.toBeTruthy();

      await waitFor(() => expect(result.current.error).toBe(i18next.t("auth.errors.invalidEmail")));
    });

    it("verifyEmailOtp throws when Clerk isn't bootstrapped", async () => {
      mockClerkInstance = null;
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await expect(result.current.verifyEmailOtp({ email: "a@b.com", token: "123456" })).rejects.toThrow();
    });

    it("maps an incorrect code error to the localized otpIncorrect message, never the raw code", async () => {
      signInMock.create.mockResolvedValue({
        supportedFirstFactors: [{ strategy: "email_code", emailAddressId: "idn_1" }],
      });
      signInMock.prepareFirstFactor.mockResolvedValue({});
      signInMock.attemptFirstFactor.mockRejectedValue({ errors: [{ code: "form_code_incorrect" }] });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await act(() =>
        result.current.requestEmailOtp({ email: "a@b.com", marketingOptIn: false, shouldCreateUser: false })
      );
      await expect(result.current.verifyEmailOtp({ email: "a@b.com", token: "000000" })).rejects.toBeTruthy();

      await waitFor(() => expect(result.current.error).toBe(i18next.t("auth.errors.otpIncorrect")));
    });
  });

  describe("signInWithProvider", () => {
    it("throws when Clerk isn't configured", async () => {
      mockClerkInstance = null;
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await expect(result.current.signInWithProvider("google")).rejects.toThrow();
    });

    it("inside Tauri: creates the sign-in and opens the external URL in the system browser", async () => {
      mockIsTauriApp = true;
      signInMock.create.mockResolvedValue({
        firstFactorVerification: { externalVerificationRedirectURL: new URL("https://accounts.google.com/oauth") },
      });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await act(() => result.current.signInWithProvider("google"));

      expect(signInMock.create).toHaveBeenCalledWith({
        strategy: "oauth_google",
        redirectUrl: "https://cinetrack.app/auth/callback",
      });
      expect(openUrlMock).toHaveBeenCalledWith("https://accounts.google.com/oauth");
    });

    it("inside Tauri: rejects when Clerk returns no external authorization URL", async () => {
      mockIsTauriApp = true;
      signInMock.create.mockResolvedValue({ firstFactorVerification: { externalVerificationRedirectURL: null } });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await expect(result.current.signInWithProvider("google")).rejects.toThrow();
      await waitFor(() => expect(result.current.error).toBe(i18next.t("auth.errors.noOAuthUrl")));
      expect(openUrlMock).not.toHaveBeenCalled();
    });

    it("inside Tauri: rejects a non-https authorization URL", async () => {
      mockIsTauriApp = true;
      signInMock.create.mockResolvedValue({
        firstFactorVerification: { externalVerificationRedirectURL: new URL("http://insecure.example") },
      });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await expect(result.current.signInWithProvider("google")).rejects.toThrow();
      await waitFor(() => expect(result.current.error).toBe(i18next.t("auth.errors.invalidOAuthUrl")));
      expect(openUrlMock).not.toHaveBeenCalled();
    });

    it("outside Tauri: uses Clerk's standard authenticateWithRedirect instead of opening a browser window", async () => {
      signInMock.authenticateWithRedirect.mockResolvedValue(undefined);
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await act(() => result.current.signInWithProvider("google"));

      expect(signInMock.authenticateWithRedirect).toHaveBeenCalledWith({
        strategy: "oauth_google",
        redirectUrl: "https://cinetrack.app/auth/callback",
        redirectUrlComplete: "https://cinetrack.app/auth/callback",
      });
      expect(openUrlMock).not.toHaveBeenCalled();
    });
  });

  describe("OAuth deep-link callback", () => {
    async function openDeepLink(url: string) {
      const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
      const listener = vi.mocked(onOpenUrl).mock.calls[0]?.[0];
      await act(async () => listener?.([url]));
    }

    it("activates the session from a single-instance cinetrack:deep-link event", async () => {
      mockIsTauriApp = true;
      const reloaded = { createdSessionId: "sess_si", firstFactorVerification: { status: "verified" } };
      const signInWithReload = { ...signInMock, reload: vi.fn().mockResolvedValue(reloaded) };
      mockClerkInstance = {
        client: { signIn: Object.assign(signInWithReload, reloaded), signUp: signUpMock },
        setActive: setActiveMock,
        signOut: signOutMock,
        handleRedirectCallback: handleRedirectCallbackMock,
      };

      renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(listenMock).toHaveBeenCalled());

      const listener = listenMock.mock.calls.find((call) => call[0] === "cinetrack:deep-link")?.[1] as
        ((event: { payload: string }) => void) | undefined;
      await act(async () =>
        listener?.({ payload: "https://cinetrack.app/auth/callback?rotating_token_nonce=nonce-si" })
      );

      expect(signInWithReload.reload).toHaveBeenCalledWith({ rotatingTokenNonce: "nonce-si" });
      expect(setActiveMock).toHaveBeenCalledWith({ session: "sess_si" });
    });

    it("activates the session created by a completed sign-in OAuth round trip", async () => {
      mockIsTauriApp = true;
      signInMock.create.mockResolvedValue({
        createdSessionId: null,
        firstFactorVerification: { status: "unverified" },
      });
      const reloaded = { createdSessionId: "sess_oauth", firstFactorVerification: { status: "verified" } };
      const signInWithReload = { ...signInMock, reload: vi.fn().mockResolvedValue(reloaded) };
      mockClerkInstance = {
        client: { signIn: Object.assign(signInWithReload, reloaded), signUp: signUpMock },
        setActive: setActiveMock,
        signOut: signOutMock,
        handleRedirectCallback: handleRedirectCallbackMock,
      };

      renderHook(() => useAuth(), { wrapper: createWrapper() });
      await openDeepLink("https://cinetrack.app/auth/callback?rotating_token_nonce=nonce-1");

      expect(signInWithReload.reload).toHaveBeenCalledWith({ rotatingTokenNonce: "nonce-1" });
      expect(setActiveMock).toHaveBeenCalledWith({ session: "sess_oauth" });
    });

    it("transfers into a new sign-up when the provider confirmed an identity Clerk has no user for", async () => {
      mockIsTauriApp = true;
      const signInWithReload = Object.assign(
        { ...signInMock, reload: vi.fn() },
        {
          createdSessionId: null,
          firstFactorVerification: { status: "transferable" },
        }
      );
      signInWithReload.reload.mockResolvedValue(signInWithReload);
      const signUpWithCreate = { ...signUpMock, create: vi.fn().mockResolvedValue({ createdSessionId: "sess_new" }) };
      mockClerkInstance = {
        client: { signIn: signInWithReload, signUp: signUpWithCreate },
        setActive: setActiveMock,
        signOut: signOutMock,
        handleRedirectCallback: handleRedirectCallbackMock,
      };

      renderHook(() => useAuth(), { wrapper: createWrapper() });
      await openDeepLink("https://cinetrack.app/auth/callback?rotating_token_nonce=nonce-2");

      expect(signUpWithCreate.create).toHaveBeenCalledWith({ transfer: true });
      expect(setActiveMock).toHaveBeenCalledWith({ session: "sess_new" });
    });

    it("surfaces a provider-side error carried on the callback URL", async () => {
      mockIsTauriApp = true;
      renderHook(() => useAuth(), { wrapper: createWrapper() });

      await openDeepLink("https://cinetrack.app/auth/callback?error_description=access_denied");

      await waitFor(() => expect(i18next.t("auth.errors.default")).toBeTruthy());
    });

    it("ignores a callback URL that doesn't match the configured redirect", async () => {
      mockIsTauriApp = true;
      renderHook(() => useAuth(), { wrapper: createWrapper() });

      await openDeepLink("https://unrelated.example/callback?rotating_token_nonce=nonce-3");

      expect(setActiveMock).not.toHaveBeenCalled();
    });

    it("ignores an unparsable callback URL instead of throwing", async () => {
      mockIsTauriApp = true;
      renderHook(() => useAuth(), { wrapper: createWrapper() });

      await openDeepLink("not a url");

      expect(setActiveMock).not.toHaveBeenCalled();
    });

    it("is a no-op when the bootstrapped Clerk instance has no client yet", async () => {
      mockIsTauriApp = true;
      mockClerkInstance = {
        client: undefined,
        setActive: setActiveMock,
        signOut: signOutMock,
        handleRedirectCallback: handleRedirectCallbackMock,
      };
      renderHook(() => useAuth(), { wrapper: createWrapper() });

      await openDeepLink("https://cinetrack.app/auth/callback?rotating_token_nonce=nonce-4");

      expect(setActiveMock).not.toHaveBeenCalled();
    });

    it("processes a cold-start deep link already queued when the plugin loads", async () => {
      mockIsTauriApp = true;
      signInMock.create.mockResolvedValue({
        createdSessionId: null,
        firstFactorVerification: { status: "unverified" },
      });
      const reloaded = { createdSessionId: "sess_cold", firstFactorVerification: { status: "verified" } };
      const signInWithReload = Object.assign({ ...signInMock, reload: vi.fn() }, reloaded);
      signInWithReload.reload.mockResolvedValue(reloaded);
      mockClerkInstance = {
        client: { signIn: signInWithReload, signUp: signUpMock },
        setActive: setActiveMock,
        signOut: signOutMock,
        handleRedirectCallback: handleRedirectCallbackMock,
      };
      const { getCurrent } = await import("@tauri-apps/plugin-deep-link");
      vi.mocked(getCurrent).mockResolvedValueOnce([
        "https://cinetrack.app/auth/callback?rotating_token_nonce=nonce-cold",
      ]);

      renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(setActiveMock).toHaveBeenCalledWith({ session: "sess_cold" }));
    });

    it("does not touch the deep-link plugin when Clerk isn't bootstrapped", async () => {
      mockIsTauriApp = true;
      mockClerkInstance = null;
      const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");

      renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(onOpenUrl).not.toHaveBeenCalled());
    });

    it("keeps listening for single-instance deep links when onOpenUrl fails", async () => {
      mockIsTauriApp = true;
      const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
      vi.mocked(onOpenUrl).mockRejectedValueOnce(new Error("plugin unavailable"));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(listenMock).toHaveBeenCalled());
      expect(result.current.error).toBeNull();
    });

    it("accepts the empty-host cinetrack callback macOS delivers after OAuth", async () => {
      mockIsTauriApp = true;
      mockRedirectUrl = "cinetrack://auth/callback";
      const pendingReload = vi.fn().mockResolvedValue({
        createdSessionId: "sess_scheme",
        firstFactorVerification: { status: "verified" },
      });
      signInMock.create.mockResolvedValue({
        reload: pendingReload,
        firstFactorVerification: { externalVerificationRedirectURL: new URL("https://accounts.google.com/oauth") },
      });
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await act(() => result.current.signInWithProvider("google"));
      await openDeepLink("cinetrack:///auth/callback?rotating_token_nonce=nonce-scheme");

      expect(pendingReload).toHaveBeenCalledWith({ rotatingTokenNonce: "nonce-scheme" });
      expect(setActiveMock).toHaveBeenCalledWith({ session: "sess_scheme" });
    });

    it("activates the session from the desktop loopback OAuth callback", async () => {
      mockIsTauriApp = true;
      mockRedirectUrl = "http://127.0.0.1:7420/auth/callback";
      const reloaded = { createdSessionId: "sess_loopback", firstFactorVerification: { status: "verified" } };
      const signInWithReload = { ...signInMock, reload: vi.fn().mockResolvedValue(reloaded) };
      mockClerkInstance = {
        client: { signIn: Object.assign(signInWithReload, reloaded), signUp: signUpMock },
        setActive: setActiveMock,
        signOut: signOutMock,
        handleRedirectCallback: handleRedirectCallbackMock,
      };

      renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(listenMock).toHaveBeenCalled());

      const listener = listenMock.mock.calls.find((call) => call[0] === "cinetrack:deep-link")?.[1] as
        | ((event: { payload: string }) => void)
        | undefined;
      await act(async () =>
        listener?.({ payload: "http://127.0.0.1:7420/auth/callback?rotating_token_nonce=nonce-loop" })
      );

      expect(signInWithReload.reload).toHaveBeenCalledWith({ rotatingTokenNonce: "nonce-loop" });
      expect(setActiveMock).toHaveBeenCalledWith({ session: "sess_loopback" });
    });

    it("finishes OAuth from a queued deep link when the window is focused again", async () => {
      mockIsTauriApp = true;
      mockRedirectUrl = "cinetrack://auth/callback";
      const reloaded = { createdSessionId: "sess_focus", firstFactorVerification: { status: "verified" } };
      const signInWithReload = { ...signInMock, reload: vi.fn().mockResolvedValue(reloaded) };
      mockClerkInstance = {
        client: { signIn: Object.assign(signInWithReload, reloaded), signUp: signUpMock },
        setActive: setActiveMock,
        signOut: signOutMock,
        handleRedirectCallback: handleRedirectCallbackMock,
      };
      const { getCurrent } = await import("@tauri-apps/plugin-deep-link");
      vi.mocked(getCurrent).mockResolvedValue([]);

      renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(getCurrent).toHaveBeenCalled());

      vi.mocked(getCurrent).mockResolvedValueOnce(["cinetrack://auth/callback?rotating_token_nonce=nonce-focus"]);
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });

      await waitFor(() => expect(setActiveMock).toHaveBeenCalledWith({ session: "sess_focus" }));
    });
  });

  describe("signOut", () => {
    it("calls Clerk's signOut and evicts local-scoped query data", async () => {
      signOutMock.mockResolvedValue(undefined);
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await act(() => result.current.signOut());

      expect(signOutMock).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when Clerk isn't bootstrapped", async () => {
      mockClerkInstance = null;
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await act(() => result.current.signOut());

      expect(signOutMock).not.toHaveBeenCalled();
    });

    it("sets the error state and rethrows on failure, never the raw message", async () => {
      signOutMock.mockRejectedValue(new Error("network error"));
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await expect(result.current.signOut()).rejects.toBeTruthy();
      await waitFor(() => expect(result.current.error).toBe(i18next.t("auth.errors.default")));
    });
  });

  it("clearError() resets a previously set error and its detail", async () => {
    signOutMock.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await expect(result.current.signOut()).rejects.toBeTruthy();
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.clearError());

    expect(result.current.error).toBeNull();
    expect(result.current.errorDetail).toBeNull();
  });
});
