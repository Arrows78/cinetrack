import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation, Trans } from "react-i18next";

import { authConfig, type SocialAuthProvider } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-context";
import { getEnabledSocialProviders } from "@/features/auth/provider-availability";
import { AuthBackdrop } from "@/features/auth/auth-backdrop";
import { AuthBrandMark } from "@/features/auth/auth-brand-mark";
import { AuthEmailStep } from "@/features/auth/auth-email-step";
import { AuthOtpStep } from "@/features/auth/auth-otp-step";
import { AuthProvidersStep, type ProviderSettingsStatus } from "@/features/auth/auth-providers-step";
import { cn } from "@/shared/lib/cn";

type AuthMode = "signin" | "signup";
type AuthStep = "providers" | "email" | "otp";

const AUTH_MODES: readonly AuthMode[] = ["signin", "signup"];

function PolicyLink({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href) return <span className="font-semibold text-primary">{children}</span>;

  return (
    <a className="font-semibold text-primary hover:underline" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function AuthScreen() {
  const { t } = useTranslation();
  const { error, clearError, requestEmailOtp, signInWithProvider, verifyEmailOtp } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [step, setStep] = useState<AuthStep>("providers");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [enabledSocialProviders, setEnabledSocialProviders] = useState<SocialAuthProvider[]>([]);
  const [providerSettingsStatus, setProviderSettingsStatus] = useState<ProviderSettingsStatus>("loading");
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const title = useMemo(() => (mode === "signin" ? t("auth.welcomeBack") : t("auth.createAccount")), [mode, t]);
  const visibleError = localError ?? error;
  const resendSeconds = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  useEffect(() => {
    const controller = new AbortController();

    void getEnabledSocialProviders(controller.signal)
      .then((enabledProviders) => {
        if (enabledProviders === null) {
          setProviderSettingsStatus("unavailable");
          return;
        }

        setEnabledSocialProviders(enabledProviders);
        setProviderSettingsStatus("ready");
      })
      .catch((settingsError: unknown) => {
        if (settingsError instanceof Error && settingsError.name === "AbortError") return;
        setProviderSettingsStatus("unavailable");
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!resendAvailableAt || resendAvailableAt <= Date.now()) return;

    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);

      if (currentTime >= resendAvailableAt) {
        window.clearInterval(timer);
      }
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);

  function resetError() {
    setLocalError(null);
    clearError();
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setStep("providers");
    setToken("");
    setResendAvailableAt(0);
    resetError();
  }

  async function handleProvider(provider: SocialAuthProvider) {
    resetError();

    if (providerSettingsStatus === "ready" && !enabledSocialProviders.includes(provider)) {
      setLocalError(t("auth.errors.providerNotEnabled", { provider: provider === "x" ? "X" : provider }));
      return;
    }

    setPendingAction(provider);

    try {
      await signInWithProvider(provider);
    } catch {
      // AuthContext exposes the actionable error message.
    } finally {
      setPendingAction(null);
    }
  }

  async function sendEmailOtp() {
    resetError();

    if (!isValidEmail(email)) {
      setLocalError(t("auth.errors.invalidEmail"));
      return;
    }

    await requestEmailOtp({
      email: email.trim(),
      marketingOptIn: mode === "signup" && marketingOptIn,
      shouldCreateUser: mode === "signup",
    });

    setToken("");
    setStep("otp");
    setNow(Date.now());
    setResendAvailableAt(Date.now() + authConfig.otpResendSeconds * 1_000);
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("email");

    try {
      await sendEmailOtp();
    } catch {
      // AuthContext exposes the actionable error message.
    } finally {
      setPendingAction(null);
    }
  }

  async function handleResend() {
    if (resendSeconds > 0 || pendingAction !== null) return;

    setPendingAction("resend");

    try {
      await sendEmailOtp();
    } catch {
      // AuthContext exposes the actionable error message.
    } finally {
      setPendingAction(null);
    }
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetError();

    if (!new RegExp(`^\\d{${authConfig.otpLength}}$`).test(token)) {
      setLocalError(t("auth.errors.enterOtpCode", { length: authConfig.otpLength }));
      return;
    }

    setPendingAction("otp");

    try {
      await verifyEmailOtp({ email: email.trim(), token });
    } catch {
      // AuthContext exposes the actionable error message.
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-black text-auth-foreground lg:flex-row">
      <div className="relative order-2 h-56 shrink-0 sm:h-72 lg:order-1 lg:h-auto lg:flex-1">
        <AuthBackdrop />
      </div>

      <div className="relative z-10 order-1 flex flex-1 flex-col justify-center bg-auth-surface px-5 py-8 sm:px-8 lg:order-2 lg:w-[28rem] lg:flex-none lg:px-10">
        <div className="mb-7">
          <AuthBrandMark />
        </div>

        <section>
          <div className="mb-7 grid grid-cols-2 rounded-2xl bg-black/30 p-1">
            {AUTH_MODES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => changeMode(option)}
                className={cn(
                  "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                  mode === option ? "bg-white text-black" : "text-auth-foreground/60 hover:text-auth-foreground"
                )}
              >
                {option === "signin" ? t("auth.tabs.signIn") : t("auth.tabs.signUp")}
              </button>
            ))}
          </div>

          {step === "providers" ? (
            <AuthProvidersStep
              title={title}
              pendingAction={pendingAction}
              providerSettingsStatus={providerSettingsStatus}
              enabledSocialProviders={enabledSocialProviders}
              onProvider={(provider) => void handleProvider(provider)}
              onEmail={() => {
                resetError();
                setStep("email");
              }}
            />
          ) : null}

          {step === "email" ? (
            <AuthEmailStep
              mode={mode}
              email={email}
              marketingOptIn={marketingOptIn}
              pendingAction={pendingAction}
              onEmailChange={setEmail}
              onMarketingOptInToggle={() => setMarketingOptIn((value) => !value)}
              onSubmit={(event) => void handleEmailSubmit(event)}
              onBack={() => {
                resetError();
                setStep("providers");
              }}
            />
          ) : null}

          {step === "otp" ? (
            <AuthOtpStep
              email={email}
              token={token}
              pendingAction={pendingAction}
              resendSeconds={resendSeconds}
              onTokenChange={setToken}
              onSubmit={(event) => void handleOtpSubmit(event)}
              onResend={() => void handleResend()}
              onBack={() => {
                resetError();
                setToken("");
                setStep("email");
              }}
            />
          ) : null}

          {visibleError ? (
            <p
              role="alert"
              aria-live="polite"
              className="mt-5 rounded-2xl border border-auth-destructive/25 bg-auth-destructive/10 px-4 py-3 text-sm text-auth-foreground/90"
            >
              {visibleError}
            </p>
          ) : null}

          <p className="mt-8 text-center text-xs leading-5 text-auth-foreground/50">
            <Trans
              i18nKey="auth.legal.agreeTo"
              components={{
                1: <PolicyLink href={authConfig.termsUrl} />,
                3: <PolicyLink href={authConfig.privacyUrl} />,
              }}
            />
          </p>
        </section>
      </div>
    </div>
  );
}
