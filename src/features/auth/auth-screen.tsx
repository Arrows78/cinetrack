import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation, Trans } from "react-i18next";
import { ArrowLeft, Check, LoaderCircle, Mail, RotateCw, ShieldCheck } from "lucide-react";

import { authConfig, type SocialAuthProvider } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-context";
import { getEnabledSocialProviders } from "@/features/auth/provider-availability";
import { ProviderIcon } from "@/features/auth/provider-icon";
import { cn } from "@/shared/lib/cn";

type AuthMode = "signin" | "signup";
type AuthStep = "providers" | "email" | "otp";
type ProviderSettingsStatus = "loading" | "ready" | "unavailable";

const providerIds: Array<{
  provider: SocialAuthProvider;
  className: string;
}> = [
  { provider: "apple", className: "bg-white text-black" },
  { provider: "facebook", className: "bg-[#1877f2] text-white" },
  { provider: "google", className: "bg-white text-black" },
  { provider: "x", className: "bg-white text-black" },
];

const backdropTileKeys = [
  "auth.backdrop.midnight",
  "auth.backdrop.redHorizon",
  "auth.backdrop.theVoyage",
  "auth.backdrop.neonCity",
  "auth.backdrop.theArchive",
  "auth.backdrop.lastSignal",
  "auth.backdrop.wildNorth",
  "auth.backdrop.orbit",
  "auth.backdrop.afterglow",
  "auth.backdrop.dust",
  "auth.backdrop.blueRoom",
  "auth.backdrop.nocturne",
] as const;

const backdropGradients = [
  "linear-gradient(145deg, #161a28, #2c3658)",
  "linear-gradient(145deg, #3b1116, #8a272d)",
  "linear-gradient(145deg, #0f2430, #1d5a70)",
  "linear-gradient(145deg, #251147, #6d25a8)",
  "linear-gradient(145deg, #1e1e1e, #585858)",
  "linear-gradient(145deg, #3a220b, #9c661e)",
  "linear-gradient(145deg, #12261d, #34704f)",
  "linear-gradient(145deg, #101825, #314976)",
  "linear-gradient(145deg, #3c142f, #9e3d77)",
  "linear-gradient(145deg, #33291c, #8c7048)",
  "linear-gradient(145deg, #121f39, #315eab)",
  "linear-gradient(145deg, #17131d, #4d3b60)",
];

function PolicyLink({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href) return <span className="font-semibold text-primary">{children}</span>;

  return (
    <a className="font-semibold text-primary hover:underline" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function AuthBackdrop() {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 grid grid-cols-3 gap-1 overflow-hidden bg-black p-1 opacity-65 sm:grid-cols-4">
      {backdropTileKeys.map((key, index) => (
        <div
          key={key}
          className={cn(
            "relative min-h-36 overflow-hidden rounded-sm border border-white/5",
            index % 4 === 1 && "translate-y-8",
            index % 4 === 3 && "-translate-y-5"
          )}
          style={{ background: backdropGradients[index] }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.2),transparent_45%)]" />
          <p className="absolute inset-x-2 bottom-3 text-center text-[11px] font-black tracking-[0.18em] text-white/70">
            {t(key)}
          </p>
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/55 to-black" />
    </div>
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
  const [now, setNow] = useState(Date.now());

  const title = useMemo(
    () => (mode === "signin" ? t("auth.welcomeBack") : t("auth.createAccount")),
    [mode, t]
  );
  const visibleError = localError ?? error;
  const visibleProviders =
    providerSettingsStatus === "ready"
      ? providerIds.filter(({ provider }) => enabledSocialProviders.includes(provider))
      : providerIds;
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
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <AuthBackdrop />
      <div className="relative z-10 flex min-h-screen flex-col justify-end px-4 pb-4 pt-24 sm:items-center sm:justify-center sm:p-8">
        <div className="mb-7 flex items-center gap-3 drop-shadow-2xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-black/80 ring-1 ring-white/15">
            <span className="text-3xl font-black text-primary">C</span>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-white/60">{t("sidebar.brand.tagline")}</p>
            <p className="text-3xl font-black tracking-tight">{t("sidebar.brand.name")}</p>
          </div>
        </div>

        <section className="w-full max-w-[560px] rounded-[34px] border border-white/10 bg-[#1d1d1f]/95 p-6 shadow-2xl backdrop-blur-2xl sm:p-9">
          <div className="mb-7 grid grid-cols-2 rounded-2xl bg-black/30 p-1">
            {(["signin", "signup"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => changeMode(option)}
                className={cn(
                  "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                  mode === option ? "bg-white text-black" : "text-white/60 hover:text-white"
                )}
              >
                {option === "signin" ? t("auth.tabs.signIn") : t("auth.tabs.signUp")}
              </button>
            ))}
          </div>

          {step === "providers" ? (
            <>
              <div className="text-center">
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
                <p className="mt-2 text-sm text-white/55">{t("auth.continueWithProviderOrEmail")}</p>
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-4">
                {visibleProviders.map(({ provider, className }) => (
                  <button
                    key={provider}
                    type="button"
                    aria-label={t("auth.provider.continueWith", { label: provider === "x" ? "X" : provider })}
                    title={t("auth.provider.continueWith", { label: provider === "x" ? "X" : provider })}
                    disabled={pendingAction !== null || providerSettingsStatus === "loading"}
                    onClick={() => void handleProvider(provider)}
                    className={cn(
                      "flex h-16 w-16 items-center justify-center rounded-full shadow-xl transition hover:-translate-y-1 disabled:cursor-wait disabled:opacity-60 sm:h-[72px] sm:w-[72px]",
                      className
                    )}
                  >
                    {pendingAction === provider ? (
                      <LoaderCircle className="h-7 w-7 animate-spin" />
                    ) : (
                      <ProviderIcon provider={provider} className="h-8 w-8" />
                    )}
                  </button>
                ))}

                <button
                  type="button"
                  aria-label={t("auth.emailButton.ariaLabel")}
                  title={t("auth.emailButton.title")}
                  disabled={pendingAction !== null}
                  onClick={() => {
                    resetError();
                    setStep("email");
                  }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition hover:-translate-y-1 disabled:opacity-60 sm:h-[72px] sm:w-[72px]"
                >
                  <Mail className="h-8 w-8" />
                </button>
              </div>

              {providerSettingsStatus === "loading" ? (
                <p className="mt-4 text-center text-xs text-white/45">{t("auth.status.checkingProviders")}</p>
              ) : null}

              {providerSettingsStatus === "ready" && enabledSocialProviders.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-center text-xs leading-5 text-amber-100">
                  {t("auth.status.noProvidersEnabled")}
                </p>
              ) : null}

              {providerSettingsStatus === "unavailable" ? (
                <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-center text-xs leading-5 text-amber-100">
                  {t("auth.status.providerConfigError")}
                </p>
              ) : null}
            </>
          ) : null}

          {step === "email" ? (
            <form onSubmit={(event) => void handleEmailSubmit(event)}>
              <button
                type="button"
                onClick={() => {
                  resetError();
                  setStep("providers");
                }}
                className="mb-7 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" /> {t("auth.email.back")}
              </button>

              <h1 className="text-3xl font-black">{mode === "signin" ? t("auth.email.signInByEmail") : t("auth.email.createAccountTitle")}</h1>
              <p className="mt-2 text-sm text-white/55">{t("auth.email.sendCodeDescription", { length: authConfig.otpLength })}</p>

              <div className="mt-7 flex items-center gap-3 border-b border-white/45 px-2 pb-3 focus-within:border-primary">
                <Mail className="h-6 w-6 text-white/75" />
                <input
                  autoFocus
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("auth.email.placeholder")}
                  className="min-w-0 flex-1 bg-transparent text-xl text-white outline-none placeholder:text-white/35"
                />
              </div>

              {mode === "signup" ? (
                <label className="mt-7 flex cursor-pointer items-start gap-3 text-sm text-white/75">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={marketingOptIn}
                    onClick={() => setMarketingOptIn((value) => !value)}
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition",
                      marketingOptIn
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/60 bg-transparent"
                    )}
                  >
                    {marketingOptIn ? <Check className="h-4 w-4" /> : null}
                  </button>
                  <span>{t("auth.email.marketingOptIn")}</span>
                </label>
              ) : null}

              <button
                type="submit"
                disabled={pendingAction !== null}
                className="mt-10 flex h-14 w-full items-center justify-center rounded-full bg-primary text-base font-black uppercase tracking-[0.08em] text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {pendingAction === "email" ? <LoaderCircle className="h-6 w-6 animate-spin" /> : t("auth.email.sendCode")}
              </button>
            </form>
          ) : null}

          {step === "otp" ? (
            <form onSubmit={(event) => void handleOtpSubmit(event)}>
              <button
                type="button"
                onClick={() => {
                  resetError();
                  setToken("");
                  setStep("email");
                }}
                className="mb-7 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" /> {t("auth.email.changeEmail")}
              </button>

              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h1 className="mt-5 text-3xl font-black">{t("auth.otp.checkInbox")}</h1>
              <p className="mt-2 text-sm text-white/55">
                {t("auth.otp.enterCode", { length: authConfig.otpLength, email: email.trim() })}
              </p>

              <input
                autoFocus
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                value={token}
                maxLength={authConfig.otpLength}
                onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, authConfig.otpLength))}
                placeholder={"0".repeat(authConfig.otpLength)}
                aria-label={t("auth.otp.ariaLabel")}
                className="mt-7 h-16 w-full rounded-2xl border border-white/20 bg-black/30 px-4 text-center text-3xl font-black tracking-[0.3em] text-white outline-none placeholder:text-white/20 focus:border-primary"
              />

              <button
                type="submit"
                disabled={pendingAction !== null}
                className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-primary text-base font-black uppercase tracking-[0.08em] text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {pendingAction === "otp" ? <LoaderCircle className="h-6 w-6 animate-spin" /> : t("auth.otp.verify")}
              </button>

              <button
                type="button"
                disabled={pendingAction !== null || resendSeconds > 0}
                onClick={() => void handleResend()}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-white/65 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {pendingAction === "resend" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCw className="h-4 w-4" />
                )}
                {resendSeconds > 0 ? t("auth.otp.resendIn", { seconds: resendSeconds }) : t("auth.otp.resendCode")}
              </button>
            </form>
          ) : null}

          {visibleError ? (
            <p
              role="alert"
              aria-live="polite"
              className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100"
            >
              {visibleError}
            </p>
          ) : null}

          <p className="mt-8 text-center text-xs leading-5 text-white/50">
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
