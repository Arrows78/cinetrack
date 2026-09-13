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
} from "@/features/auth/use-auth";
import { logger } from "@/shared/lib/logger";
import { UserFacingError } from "@/shared/lib/user-facing-error";

interface AuthErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

/**
 * `detail` is only ever set on the final, unrecognized-error branch — every
 * other branch already gives the user a specific, actionable translated
 * message, so there's nothing more useful to copy. See use-auth.ts's
 * AuthContextValue.errorDetail doc comment for how the UI uses it.
 */
function describeError(error: unknown): { message: string; detail: string | null } {
  const authError = error as AuthErrorLike;
  const code = authError?.code;
  const message = authError?.message?.toLowerCase() ?? "";

  if (authError?.status === 429 || code === "over_email_send_rate_limit") {
    return { message: i18next.t("auth.errors.rateLimited"), detail: null };
  }

  if (code === "otp_expired" || message.includes("expired")) {
    return { message: i18next.t("auth.errors.otpExpired"), detail: null };
  }

  if (code === "email_address_invalid" || message.includes("invalid email")) {
    return { message: i18next.t("auth.errors.invalidEmail"), detail: null };
  }

  if (
    code === "signup_disabled" ||
    code === "user_not_found" ||
    message.includes("signups not allowed") ||
    message.includes("user not found")
  ) {
    return { message: i18next.t("auth.errors.noAccount"), detail: null };
  }

  if (code === "bad_code_verifier") {
    return { message: i18next.t("auth.errors.badCodeVerifier"), detail: null };
  }

  if (error instanceof UserFacingError) {
    return { message: error.message, detail: null };
  }

  const raw = error instanceof Error ? error.message : String(error);
  logger.warn(`Auth error: ${raw}`);
  return { message: i18next.t("auth.errors.default"), detail: code ? `${code}: ${raw}` : raw };
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
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const handledCallbackUrls = useRef(new Set<string>());

  const clearError = useCallback(() => {
    setError(null);
    setErrorDetail(null);
  }, []);

  const applyError = useCallback((raw: unknown) => {
    const { message, detail } = describeError(raw);
    setError(message);
    setErrorDetail(detail);
  }, []);

  const handleCallbackUrl = useCallback(
    async (callbackUrl: string) => {
      const client = await getAuthClient();

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
        clearError();
      } catch (callbackError) {
        applyError(callbackError);
      } finally {
        if (handledCallbackUrls.current.size > 20) {
          handledCallbackUrls.current.clear();
        }
      }
    },
    [applyError, clearError]
  );

  useEffect(() => {
    let disposed = false;
    let unlistenDeepLinks: (() => void) | undefined;
    let authListener: { subscription: { unsubscribe: () => void } } | undefined;

    async function initialize() {
      const client = await getAuthClient();

      if (!client || disposed) {
        if (!disposed) setStatus("ready");
        return;
      }

      authListener = client.auth.onAuthStateChange((_event: AuthChangeEvent, nextSession: Session | null) => {
        if (!disposed) {
          setSession(nextSession);
        }
      }).data;

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

        const { data, error: sessionError } = await client.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!disposed) {
          setSession(data.session);
        }
      } catch (initializationError) {
        if (!disposed) {
          applyError(initializationError);
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
      authListener?.subscription.unsubscribe();
      unlistenDeepLinks?.();
    };
  }, [applyError, handleCallbackUrl]);

  const signInWithProvider = useCallback(
    async (provider: SocialAuthProvider) => {
      const client = await getAuthClient();

      if (!client) {
        throw new UserFacingError(i18next.t("auth.errors.notConfigured"));
      }

      clearError();

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
        applyError(providerError);
        throw providerError;
      }
    },
    [applyError, clearError]
  );

  const requestEmailOtp = useCallback(
    async ({ email, marketingOptIn, shouldCreateUser }: EmailOtpRequest) => {
      const client = await getAuthClient();

      if (!client) {
        throw new UserFacingError(i18next.t("auth.errors.notConfigured"));
      }

      clearError();

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
        applyError(requestError);
        throw requestError;
      }
    },
    [applyError, clearError]
  );

  const verifyEmailOtp = useCallback(
    async ({ email, token }: EmailOtpVerification) => {
      const client = await getAuthClient();

      if (!client) {
        throw new UserFacingError(i18next.t("auth.errors.notConfigured"));
      }

      clearError();

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
        applyError(verificationError);
        throw verificationError;
      }
    },
    [applyError, clearError]
  );

  const signOut = useCallback(async () => {
    const client = await getAuthClient();

    if (!client) return;

    clearError();

    const { error: signOutError } = await client.auth.signOut({ scope: "local" });

    if (signOutError) {
      applyError(signOutError);
      throw signOutError;
    }

    setSession(null);
    // The next signed-in-or-not profile resolves to different "local"-scoped
    // data (see ProfileGate) — removeQueries (not just invalidateQueries)
    // evicts it from memory and from the localStorage persister immediately,
    // rather than merely marking it stale, so a signed-out user can't
    // briefly keep seeing the previous account's cached library/history/etc.
    queryClient.removeQueries({ queryKey: ["local"] });
  }, [applyError, clearError, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: authConfig.configured,
      required: authConfig.required,
      status,
      session,
      user: session?.user ?? null,
      error,
      errorDetail,
      clearError,
      signInWithProvider,
      requestEmailOtp,
      verifyEmailOtp,
      signOut,
    }),
    [clearError, error, errorDetail, requestEmailOtp, session, signInWithProvider, signOut, status, verifyEmailOtp]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
