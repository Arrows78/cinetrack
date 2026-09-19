import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { useSession, useUser } from "@clerk/react";
import { useSignIn, useSignUp } from "@clerk/react/legacy";
import type { EmailCodeFactor, OAuthStrategy } from "@clerk/react/types";
import { useQueryClient } from "@tanstack/react-query";
import i18next from "i18next";

import { authConfig, getAuthRedirectUrl, getClerkInstance, type SocialAuthProvider } from "@/features/auth/auth-client";
import { isTauriApp } from "@/shared/lib/platform";
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
  type EmailOtpRequest,
  type EmailOtpVerification,
} from "@/features/auth/use-auth";
import { EVENTS } from "@/shared/constants/events";
import { logger } from "@/shared/lib/logger";
import { UserFacingError } from "@/shared/lib/user-facing-error";

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function callbackPath(url: URL): string {
  return `${url.host}${normalizePathname(url.pathname)}`.replace(/^\/+/, "");
}

function isAuthCallbackUrl(callbackUrl: URL, expected: URL): boolean {
  if (callbackUrl.protocol !== expected.protocol) {
    return false;
  }

  if (callbackPath(callbackUrl) === callbackPath(expected)) {
    return true;
  }

  // Custom schemes are parsed two ways depending on the OS / Clerk:
  // `cinetrack://auth/callback` → host=auth, path=/callback
  // `cinetrack:///auth/callback` → host empty, path=/auth/callback
  // Either form with the OAuth nonce (or a provider error) is the callback.
  const hasOauthResult =
    rotatingTokenNonceFrom(callbackUrl) !== null ||
    Boolean(callbackUrl.searchParams.get("error") || callbackUrl.searchParams.get("error_description"));

  if (callbackUrl.protocol === "cinetrack:" && hasOauthResult) {
    return true;
  }

  // Desktop `tauri dev` cannot receive `cinetrack://`. The Rust loopback
  // server emits this exact origin after Clerk redirects the system browser.
  return (
    hasOauthResult &&
    (callbackUrl.hostname === "127.0.0.1" || callbackUrl.hostname === "localhost") &&
    callbackUrl.port === "7420"
  );
}

function rotatingTokenNonceFrom(url: URL): string | null {
  return (
    url.searchParams.get("rotating_token_nonce") ??
    new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash).get("rotating_token_nonce")
  );
}

const OAUTH_STRATEGY: Record<SocialAuthProvider, OAuthStrategy> = {
  apple: "oauth_apple",
  facebook: "oauth_facebook",
  google: "oauth_google",
  x: "oauth_x",
};

interface ClerkErrorLike {
  status?: number;
  errors?: Array<{ code?: string; message?: string }>;
}

/**
 * `detail` is only ever set on the final, unrecognized-error branch — every
 * other branch already gives the user a specific, actionable translated
 * message, so there's nothing more useful to copy. See use-auth.ts's
 * AuthContextValue.errorDetail doc comment for how the UI uses it.
 */
function describeError(error: unknown): { message: string; detail: string | null } {
  const clerkError = error as ClerkErrorLike;
  const code = clerkError?.errors?.[0]?.code;

  if (clerkError?.status === 429 || code === "too_many_requests") {
    return { message: i18next.t("auth.errors.rateLimited"), detail: null };
  }

  if (code === "verification_expired") {
    return { message: i18next.t("auth.errors.otpExpired"), detail: null };
  }

  if (code === "form_code_incorrect") {
    return { message: i18next.t("auth.errors.otpIncorrect"), detail: null };
  }

  if (code === "form_param_format_invalid") {
    return { message: i18next.t("auth.errors.invalidEmail"), detail: null };
  }

  if (code === "form_identifier_not_found") {
    return { message: i18next.t("auth.errors.noAccount"), detail: null };
  }

  if (code === "form_identifier_exists") {
    return { message: i18next.t("auth.errors.accountExists"), detail: null };
  }

  if (error instanceof UserFacingError) {
    return { message: error.message, detail: null };
  }

  const raw = clerkError?.errors?.[0]?.message ?? (error instanceof Error ? error.message : String(error));
  logger.warn(`Auth error: ${raw}`);
  return { message: i18next.t("auth.errors.default"), detail: code ? `${code}: ${raw}` : raw };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isEmailCodeFactor(factor: { strategy: string }): factor is EmailCodeFactor {
  return factor.strategy === "email_code";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const { isLoaded: sessionLoaded, session } = useSession();
  const { user } = useUser();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const handledCallbackUrls = useRef(new Set<string>());
  // Tracks which of signIn/signUp the last requestEmailOtp() call started,
  // so verifyEmailOtp() knows which resource's attempt*Verification method
  // to call — Clerk's email-code flow is a two-call sequence (prepare, then
  // attempt) split across these two functions in AuthContextValue, and the
  // classic SignIn/SignUp resources have no shared "verify" method.
  const pendingFlowRef = useRef<"signIn" | "signUp" | null>(null);
  const pendingOauthSignInRef = useRef<{
    reload: (params: { rotatingTokenNonce: string }) => Promise<{
      createdSessionId: string | null;
      firstFactorVerification: { status: string | null };
    }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
    setErrorDetail(null);
  }, [setError, setErrorDetail]);

  const applyError = useCallback(
    (raw: unknown) => {
      const { message, detail } = describeError(raw);
      setError(message);
      setErrorDetail(detail);
    },
    [setError, setErrorDetail]
  );

  const handleDeepLinkCallback = useCallback(
    async (callbackUrl: string) => {
      const clerk = getClerkInstance();

      if (!clerk?.client) {
        logger.warn("Ignoring auth deep link: Clerk client is not ready");
        return;
      }

      let url: URL;

      try {
        url = new URL(callbackUrl);
      } catch {
        return;
      }

      const expectedRedirect = new URL(getAuthRedirectUrl());

      if (!isAuthCallbackUrl(url, expectedRedirect)) {
        logger.warn(`Ignoring deep link that is not the auth callback: ${callbackUrl}`);
        return;
      }

      logger.warn(`Handling auth deep link: ${callbackUrl}`);

      const rotatingTokenNonce = rotatingTokenNonceFrom(url);

      if (!rotatingTokenNonce && !url.searchParams.get("error") && !url.searchParams.get("error_description")) {
        applyError(new UserFacingError(i18next.t("auth.errors.oauthCallbackIncomplete")));
        return;
      }

      if (handledCallbackUrls.current.has(callbackUrl)) {
        return;
      }

      handledCallbackUrls.current.add(callbackUrl);

      try {
        const callbackError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

        if (callbackError) {
          throw new Error(callbackError);
        }

        if (!rotatingTokenNonce) return;

        const pendingSignIn = pendingOauthSignInRef.current ?? clerk.client.signIn ?? signIn;
        const reloaded = await pendingSignIn.reload({ rotatingTokenNonce });
        pendingOauthSignInRef.current = null;

        let createdSessionId = reloaded.createdSessionId;

        // Google (etc.) authenticated the user, but no existing Clerk user
        // matched — signIn.create({strategy: oauth_...}) always tries a
        // sign-in first, and only "transfers" into an actual signUp.create
        // once the provider confirms the identity, exactly like the
        // equivalent Expo/React Native custom OAuth flow does.
        if (!createdSessionId && reloaded.firstFactorVerification.status === "transferable") {
          const created = await clerk.client.signUp.create({ transfer: true });
          createdSessionId = created.createdSessionId;
        }

        if (!createdSessionId) {
          throw new UserFacingError(i18next.t("auth.errors.oauthCallbackIncomplete"));
        }

        await clerk.setActive({ session: createdSessionId });
        clearError();
      } catch (callbackError) {
        applyError(callbackError);
      } finally {
        if (handledCallbackUrls.current.size > 20) {
          handledCallbackUrls.current.clear();
        }
      }
    },
    [applyError, clearError, signIn]
  );

  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];

    async function readQueuedDeepLinks() {
      try {
        const { getCurrent } = await import("@/shared/lib/tauri-desktop");

        for (const url of (await getCurrent()) ?? []) {
          await handleDeepLinkCallback(url);
        }
      } catch (queuedError) {
        logger.warn(
          `Deep-link getCurrent failed: ${queuedError instanceof Error ? queuedError.message : String(queuedError)}`
        );
      }
    }

    function retainCleanup(cleanup: () => void) {
      if (disposed) {
        cleanup();
        return;
      }

      cleanups.push(cleanup);
    }

    async function initialize() {
      const clerk = getClerkInstance();

      if (!clerk) return;

      try {
        if (isTauriApp()) {
          const { onOpenUrl, listen } = await import("@/shared/lib/tauri-desktop");

          try {
            retainCleanup(
              await onOpenUrl((urls: string[]) => {
                for (const url of urls) {
                  void handleDeepLinkCallback(url);
                }
              })
            );
          } catch (openUrlError) {
            logger.warn(
              `Deep-link onOpenUrl failed: ${openUrlError instanceof Error ? openUrlError.message : String(openUrlError)}`
            );
          }

          // Warm start on macOS: single-instance consumes argv and emits
          // this event. The deep-link plugin's onOpenUrl often does not
          // fire, which left the login screen up after OAuth. Rust also
          // re-emits RunEvent::Opened on this same channel.
          try {
            retainCleanup(
              await listen<string>(EVENTS.DEEP_LINK, (event) => {
                void handleDeepLinkCallback(event.payload);
              })
            );
          } catch (listenError) {
            logger.warn(
              `Deep-link event listen failed: ${listenError instanceof Error ? listenError.message : String(listenError)}`
            );
          }

          const onWindowFocus = () => {
            void readQueuedDeepLinks();
          };
          window.addEventListener("focus", onWindowFocus);
          document.addEventListener("visibilitychange", onWindowFocus);
          retainCleanup(() => {
            window.removeEventListener("focus", onWindowFocus);
            document.removeEventListener("visibilitychange", onWindowFocus);
          });

          await readQueuedDeepLinks();
        } else {
          // Web-preview equivalent of the deep-link callback above: Clerk's
          // standard authenticateWithRedirect() flow navigates the same
          // browser tab back to getAuthRedirectUrl() after the OAuth
          // provider completes, so this is the "did we just come back from
          // that?" check — a safe no-op on every other page load (cold
          // start, email-code sign-in, ...) since there's nothing pending.
          try {
            await clerk.handleRedirectCallback({}, async () => undefined);
          } catch (redirectError) {
            // No pending OAuth handshake on a normal page load — expected.
            logger.warn(
              `Clerk handleRedirectCallback: ${redirectError instanceof Error ? redirectError.message : String(redirectError)}`
            );
          }
        }
      } catch (initializationError) {
        if (!disposed) applyError(initializationError);
      }
    }

    void initialize();

    return () => {
      disposed = true;
      for (const cleanup of cleanups) cleanup();
    };
  }, [applyError, handleDeepLinkCallback]);

  const signInWithProvider = useCallback(
    async (provider: SocialAuthProvider) => {
      const clerk = getClerkInstance();

      if (!clerk?.client) {
        throw new UserFacingError(i18next.t("auth.errors.notConfigured"));
      }

      clearError();

      const strategy = OAUTH_STRATEGY[provider];
      const redirectUrl = getAuthRedirectUrl();

      try {
        if (isTauriApp()) {
          const pendingSignIn = await (signIn ?? clerk.client.signIn).create({ strategy, redirectUrl });
          pendingOauthSignInRef.current = pendingSignIn;
          const externalUrl = pendingSignIn.firstFactorVerification.externalVerificationRedirectURL;

          if (!externalUrl) {
            throw new UserFacingError(i18next.t("auth.errors.noOAuthUrl"));
          }

          if (externalUrl.protocol !== "https:") {
            throw new UserFacingError(i18next.t("auth.errors.invalidOAuthUrl"));
          }

          const { openUrl } = await import("@/shared/lib/tauri-desktop");
          await openUrl(externalUrl.toString());
        } else {
          await clerk.client.signIn.authenticateWithRedirect({
            strategy,
            redirectUrl,
            redirectUrlComplete: redirectUrl,
          });
        }
      } catch (providerError) {
        applyError(providerError);
        throw providerError;
      }
    },
    [applyError, clearError, signIn]
  );

  const requestEmailOtp = useCallback(
    async ({ email, marketingOptIn, shouldCreateUser }: EmailOtpRequest) => {
      if (!signIn || !signUp) {
        throw new UserFacingError(i18next.t("auth.errors.notConfigured"));
      }

      clearError();

      const identifier = normalizeEmail(email);

      try {
        if (shouldCreateUser) {
          await signUp.create({
            emailAddress: identifier,
            unsafeMetadata: { marketing_opt_in: marketingOptIn },
          });
          await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
          pendingFlowRef.current = "signUp";
        } else {
          const attempt = await signIn.create({ identifier });
          const emailFactor = attempt.supportedFirstFactors?.find(isEmailCodeFactor);

          if (!emailFactor) {
            throw new UserFacingError(i18next.t("auth.errors.noAccount"));
          }

          await signIn.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: emailFactor.emailAddressId,
          });
          pendingFlowRef.current = "signIn";
        }
      } catch (requestError) {
        applyError(requestError);
        throw requestError;
      }
    },
    [applyError, clearError, signIn, signUp]
  );

  const verifyEmailOtp = useCallback(
    async ({ token }: EmailOtpVerification) => {
      const clerk = getClerkInstance();

      if (!signIn || !signUp || !clerk) {
        throw new UserFacingError(i18next.t("auth.errors.notConfigured"));
      }

      clearError();

      try {
        let createdSessionId: string | null = null;

        if (pendingFlowRef.current === "signUp") {
          const attempt = await signUp.attemptEmailAddressVerification({ code: token });
          createdSessionId = attempt.createdSessionId;
        } else {
          const attempt = await signIn.attemptFirstFactor({ strategy: "email_code", code: token });
          createdSessionId = attempt.createdSessionId;
        }

        if (createdSessionId) {
          await clerk.setActive({ session: createdSessionId });
        }

        pendingFlowRef.current = null;
      } catch (verificationError) {
        applyError(verificationError);
        throw verificationError;
      }
    },
    [applyError, clearError, signIn, signUp]
  );

  const signOut = useCallback(async () => {
    const clerk = getClerkInstance();

    if (!clerk) return;

    clearError();

    try {
      await clerk.signOut();
    } catch (signOutError) {
      applyError(signOutError);
      throw signOutError;
    }

    // The next signed-in-or-not profile resolves to different "local"-scoped
    // data (see ProfileGate) — removeQueries (not just invalidateQueries)
    // evicts it from memory and from the localStorage persister immediately,
    // rather than merely marking it stale, so a signed-out user can't
    // briefly keep seeing the previous account's cached library/history/etc.
    queryClient.removeQueries({ queryKey: ["local"] });
  }, [applyError, clearError, queryClient]);

  const clerkReady = Boolean(getClerkInstance()?.loaded);
  const status: AuthStatus = !authConfig.configured || sessionLoaded || clerkReady ? "ready" : "loading";

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: authConfig.configured,
      required: authConfig.required,
      status,
      session: session ?? null,
      user: user ?? null,
      error,
      errorDetail,
      clearError,
      signInWithProvider,
      requestEmailOtp,
      verifyEmailOtp,
      signOut,
    }),
    [
      clearError,
      error,
      errorDetail,
      requestEmailOtp,
      session,
      signInWithProvider,
      signOut,
      status,
      user,
      verifyEmailOtp,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
