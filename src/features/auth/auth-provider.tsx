import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import i18next from "i18next";

import { authConfig, getAuthClient, getAuthRedirectUrl, type SocialAuthProvider } from "@/features/auth/auth-client";
import { isTauriApp } from "@/shared/lib/platform";
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
  type EmailOtpRequest,
  type EmailOtpVerification,
} from "@/features/auth/auth-context";
import { logger } from "@/shared/lib/logger";
import { UserFacingError } from "@/shared/lib/user-facing-error";

interface AuthErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

function getErrorMessage(error: unknown): string {
  const authError = error as AuthErrorLike;
  const code = authError?.code;
  const message = authError?.message?.toLowerCase() ?? "";

  if (authError?.status === 429 || code === "over_email_send_rate_limit") {
    return i18next.t("auth.errors.rateLimited");
  }

  if (code === "otp_expired" || message.includes("expired")) {
    return i18next.t("auth.errors.otpExpired");
  }

  if (code === "email_address_invalid" || message.includes("invalid email")) {
    return i18next.t("auth.errors.invalidEmail");
  }

  if (
    code === "signup_disabled" ||
    code === "user_not_found" ||
    message.includes("signups not allowed") ||
    message.includes("user not found")
  ) {
    return i18next.t("auth.errors.noAccount");
  }

  if (code === "bad_code_verifier") {
    return i18next.t("auth.errors.badCodeVerifier");
  }

  if (error instanceof UserFacingError) {
    return error.message;
  }

  logger.warn(`Auth error: ${error instanceof Error ? error.message : String(error)}`);
  return i18next.t("auth.errors.default");
}

function readAuthCode(callbackUrl: string): string | null {
  const url = new URL(callbackUrl);
  const expectedRedirect = new URL(getAuthRedirectUrl());

  if (
    url.protocol !== expectedRedirect.protocol ||
    url.host !== expectedRedirect.host ||
    url.pathname !== expectedRedirect.pathname
  ) {
    return null;
  }

  const callbackError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (callbackError) {
    throw new Error(callbackError);
  }

  return url.searchParams.get("code");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handledCallbackUrls = useRef(new Set<string>());

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleCallbackUrl = useCallback(async (callbackUrl: string) => {
    const client = getAuthClient();

    if (!client || handledCallbackUrls.current.has(callbackUrl)) {
      return;
    }

    handledCallbackUrls.current.add(callbackUrl);

    try {
      let code: string | null = null;

      try {
        code = readAuthCode(callbackUrl);
      } finally {
        if (!isTauriApp() && typeof window !== "undefined") {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }

      if (!code) return;

      const { data, error: exchangeError } = await client.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        throw exchangeError;
      }

      setSession(data.session);
      setError(null);
    } catch (callbackError) {
      setError(getErrorMessage(callbackError));
    } finally {
      if (handledCallbackUrls.current.size > 20) {
        handledCallbackUrls.current.clear();
      }
    }
  }, []);

  useEffect(() => {
    const client = getAuthClient();

    if (!client) {
      // Deferred a microtask out: this branch's setStatus runs synchronously
      // in the effect body otherwise, which react-hooks/set-state-in-effect
      // flags — the async client-present branch below is exempt because its
      // setStatus calls live inside the `initialize()` async function.
      queueMicrotask(() => setStatus("ready"));
      return;
    }

    const authClient = client;
    let disposed = false;
    let unlistenDeepLinks: (() => void) | undefined;

    const { data: authListener } = authClient.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextSession: Session | null) => {
        if (!disposed) {
          setSession(nextSession);
        }
      }
    );

    async function initialize() {
      try {
        if (isTauriApp()) {
          const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");

          unlistenDeepLinks = await onOpenUrl((urls: string[]) => {
            for (const url of urls) {
              void handleCallbackUrl(url);
            }
          });

          const initialUrls = await getCurrent();

          for (const url of initialUrls ?? []) {
            await handleCallbackUrl(url);
          }
        } else if (typeof window !== "undefined") {
          await handleCallbackUrl(window.location.href);
        }

        const { data, error: sessionError } = await authClient.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!disposed) {
          setSession(data.session);
        }
      } catch (initializationError) {
        if (!disposed) {
          setError(getErrorMessage(initializationError));
        }
      } finally {
        if (!disposed) {
          setStatus("ready");
        }
      }
    }

    void initialize();

    return () => {
      disposed = true;
      authListener.subscription.unsubscribe();
      unlistenDeepLinks?.();
    };
  }, [handleCallbackUrl]);

  const signInWithProvider = useCallback(async (provider: SocialAuthProvider) => {
    const client = getAuthClient();

    if (!client) {
      throw new UserFacingError(i18next.t("auth.errors.notConfigured"));
    }

    setError(null);

    try {
      const desktop = isTauriApp();
      const { data, error: oauthError } = await client.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getAuthRedirectUrl(),
          skipBrowserRedirect: desktop,
        },
      });

      if (oauthError) {
        throw oauthError;
      }

      if (desktop) {
        if (!data.url) {
          throw new UserFacingError(i18next.t("auth.errors.noOAuthUrl"));
        }

        const authorizationUrl = new URL(data.url);

        if (authorizationUrl.protocol !== "https:") {
          throw new UserFacingError(i18next.t("auth.errors.invalidOAuthUrl"));
        }

        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(authorizationUrl.toString());
      }
    } catch (providerError) {
      setError(getErrorMessage(providerError));
      throw providerError;
    }
  }, []);

  const requestEmailOtp = useCallback(async ({ email, marketingOptIn, shouldCreateUser }: EmailOtpRequest) => {
    const client = getAuthClient();

    if (!client) {
      throw new UserFacingError(i18next.t("auth.errors.notConfigured"));
    }

    setError(null);

    try {
      const { error: otpError } = await client.auth.signInWithOtp({
        email: normalizeEmail(email),
        options: {
          shouldCreateUser,
          emailRedirectTo: getAuthRedirectUrl(),
          data: shouldCreateUser
            ? {
                marketing_opt_in: marketingOptIn,
              }
            : undefined,
        },
      });

      if (otpError) {
        throw otpError;
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    }
  }, []);

  const verifyEmailOtp = useCallback(async ({ email, token }: EmailOtpVerification) => {
    const client = getAuthClient();

    if (!client) {
      throw new UserFacingError(i18next.t("auth.errors.notConfigured"));
    }

    setError(null);

    try {
      const { data, error: verificationError } = await client.auth.verifyOtp({
        email: normalizeEmail(email),
        token,
        type: "email",
      });

      if (verificationError) {
        throw verificationError;
      }

      setSession(data.session);
    } catch (verificationError) {
      setError(getErrorMessage(verificationError));
      throw verificationError;
    }
  }, []);

  const signOut = useCallback(async () => {
    const client = getAuthClient();

    if (!client) return;

    setError(null);

    const { error: signOutError } = await client.auth.signOut({ scope: "local" });

    if (signOutError) {
      setError(getErrorMessage(signOutError));
      throw signOutError;
    }

    setSession(null);
    // The next signed-in-or-not profile resolves to different "local"-scoped
    // data (see ProfileGate) — removeQueries (not just invalidateQueries)
    // evicts it from memory and from the localStorage persister immediately,
    // rather than merely marking it stale, so a signed-out user can't
    // briefly keep seeing the previous account's cached library/history/etc.
    queryClient.removeQueries({ queryKey: ["local"] });
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: authConfig.configured,
      required: authConfig.required,
      status,
      session,
      user: session?.user ?? null,
      error,
      clearError,
      signInWithProvider,
      requestEmailOtp,
      verifyEmailOtp,
      signOut,
    }),
    [clearError, error, requestEmailOtp, session, signInWithProvider, signOut, status, verifyEmailOtp]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
