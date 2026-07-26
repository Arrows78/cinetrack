import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import {
  authConfig,
  getAuthClient,
  getAuthRedirectUrl,
  isTauriRuntime,
  type SocialAuthProvider,
} from "@/features/auth/auth-client";
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
  type EmailOtpRequest,
  type EmailOtpVerification,
} from "@/features/auth/auth-context";

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
    return "Too many authentication attempts. Wait a moment before trying again.";
  }

  if (code === "otp_expired" || message.includes("expired")) {
    return "This code has expired. Request a new one and try again.";
  }

  if (code === "email_address_invalid" || message.includes("invalid email")) {
    return "Enter a valid email address.";
  }

  if (
    code === "signup_disabled" ||
    code === "user_not_found" ||
    message.includes("signups not allowed") ||
    message.includes("user not found")
  ) {
    return "No CineTrack account exists for this email address.";
  }

  if (code === "bad_code_verifier") {
    return "The sign-in request could not be verified. Restart the sign-in flow.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Authentication failed. Please try again.";
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
      const code = readAuthCode(callbackUrl);

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
      setStatus("ready");
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
        if (isTauriRuntime()) {
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
      throw new Error("Supabase Auth is not configured.");
    }

    setError(null);

    try {
      const desktop = isTauriRuntime();
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
          throw new Error("Supabase did not return an OAuth authorization URL.");
        }

        const authorizationUrl = new URL(data.url);

        if (authorizationUrl.protocol !== "https:") {
          throw new Error("Supabase returned an invalid OAuth authorization URL.");
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
      throw new Error("Supabase Auth is not configured.");
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
      throw new Error("Supabase Auth is not configured.");
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
  }, []);

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
