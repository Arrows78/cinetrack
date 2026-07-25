import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type {
  AuthChangeEvent,
  Session,
} from "@supabase/supabase-js";

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
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

  const callbackError =
    url.searchParams.get("error_description") ??
    url.searchParams.get("error");

  if (callbackError) {
    throw new Error(callbackError);
  }

  return url.searchParams.get("code");
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleCallbackUrl = useCallback(
    async (callbackUrl: string) => {
      const client = getAuthClient();

      if (!client) {
        return;
      }

      try {
        const code = readAuthCode(callbackUrl);

        if (!code) {
          return;
        }

        const { data, error: exchangeError } =
          await client.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          throw exchangeError;
        }

        setSession(data.session);
        setError(null);
      } catch (callbackError) {
        setError(getErrorMessage(callbackError));
      }
    },
    [],
  );

  useEffect(() => {
    const client = getAuthClient();

    if (!client) {
      setStatus("ready");
      return;
    }

    /*
     * TypeScript peut perdre le narrowing de `client` dans une fonction
     * asynchrone imbriquée. Cette constante conserve définitivement le
     * type SupabaseClient non nullable.
     */
    const authClient = client;

    let disposed = false;
    let unlistenDeepLinks: (() => void) | undefined;

    const { data: authListener } =
      authClient.auth.onAuthStateChange(
        (
          _event: AuthChangeEvent,
          nextSession: Session | null,
        ) => {
          if (!disposed) {
            setSession(nextSession);
          }
        },
      );

    async function initialize() {
      try {
        const { data, error: sessionError } =
          await authClient.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!disposed) {
          setSession(data.session);
        }

        if (isTauriRuntime()) {
          const { getCurrent, onOpenUrl } = await import(
            "@tauri-apps/plugin-deep-link"
          );

          const initialUrls = await getCurrent();

          for (const url of initialUrls ?? []) {
            await handleCallbackUrl(url);
          }

          unlistenDeepLinks = await onOpenUrl(
            (urls: string[]) => {
              for (const url of urls) {
                void handleCallbackUrl(url);
              }
            },
          );
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

  const signInWithProvider = useCallback(
    async (provider: SocialAuthProvider) => {
      const client = getAuthClient();

      if (!client) {
        throw new Error(
          "Supabase Auth is not configured.",
        );
      }

      setError(null);

      try {
        const desktop = isTauriRuntime();

        const { data, error: oauthError } =
          await client.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo: getAuthRedirectUrl(),
              skipBrowserRedirect: desktop,
            },
          });

        if (oauthError) {
          throw oauthError;
        }

        if (desktop && data.url) {
          const { openUrl } = await import(
            "@tauri-apps/plugin-opener"
          );

          await openUrl(data.url);
        }
      } catch (providerError) {
        setError(getErrorMessage(providerError));
        throw providerError;
      }
    },
    [],
  );

  const requestEmailOtp = useCallback(
    async ({
      email,
      createUser,
      marketingOptIn,
    }: EmailOtpRequest) => {
      const client = getAuthClient();

      if (!client) {
        throw new Error(
          "Supabase Auth is not configured.",
        );
      }

      setError(null);

      try {
        const { error: otpError } =
          await client.auth.signInWithOtp({
            email,
            options: {
              shouldCreateUser: createUser,
              data: {
                marketing_opt_in: marketingOptIn,
              },
            },
          });

        if (otpError) {
          throw otpError;
        }
      } catch (requestError) {
        setError(getErrorMessage(requestError));
        throw requestError;
      }
    },
    [],
  );

  const verifyEmailOtp = useCallback(
    async ({
      email,
      token,
    }: EmailOtpVerification) => {
      const client = getAuthClient();

      if (!client) {
        throw new Error(
          "Supabase Auth is not configured.",
        );
      }

      setError(null);

      try {
        const { data, error: verificationError } =
          await client.auth.verifyOtp({
            email,
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
    },
    [],
  );

  const signOut = useCallback(async () => {
    const client = getAuthClient();

    if (!client) {
      return;
    }

    setError(null);

    const { error: signOutError } =
      await client.auth.signOut();

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
    [
      clearError,
      error,
      requestEmailOtp,
      session,
      signInWithProvider,
      signOut,
      status,
      verifyEmailOtp,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
