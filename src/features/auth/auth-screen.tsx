import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Check, LoaderCircle, Mail, RotateCw, ShieldCheck } from "lucide-react";

import { authConfig, type SocialAuthProvider } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-context";
import { getEnabledSocialProviders } from "@/features/auth/provider-availability";
import { ProviderIcon } from "@/features/auth/provider-icon";
import { cn } from "@/shared/lib/cn";

type AuthMode = "signin" | "signup";
type AuthStep = "providers" | "email" | "otp";
type ProviderSettingsStatus = "loading" | "ready" | "unavailable";

const providers: Array<{
  provider: SocialAuthProvider;
  label: string;
  className: string;
}> = [
  { provider: "apple", label: "Apple", className: "bg-white text-black" },
  { provider: "facebook", label: "Facebook", className: "bg-[#1877f2] text-white" },
  { provider: "google", label: "Google", className: "bg-white text-black" },
  { provider: "x", label: "X", className: "bg-white text-black" },
];

const backdropTiles = [
  ["MIDNIGHT", "linear-gradient(145deg, #161a28, #2c3658)"],
  ["RED HORIZON", "linear-gradient(145deg, #3b1116, #8a272d)"],
  ["THE VOYAGE", "linear-gradient(145deg, #0f2430, #1d5a70)"],
  ["NEON CITY", "linear-gradient(145deg, #251147, #6d25a8)"],
  ["THE ARCHIVE", "linear-gradient(145deg, #1e1e1e, #585858)"],
  ["LAST SIGNAL", "linear-gradient(145deg, #3a220b, #9c661e)"],
  ["WILD NORTH", "linear-gradient(145deg, #12261d, #34704f)"],
  ["ORBIT", "linear-gradient(145deg, #101825, #314976)"],
  ["AFTERGLOW", "linear-gradient(145deg, #3c142f, #9e3d77)"],
  ["DUST", "linear-gradient(145deg, #33291c, #8c7048)"],
  ["BLUE ROOM", "linear-gradient(145deg, #121f39, #315eab)"],
  ["NOCTURNE", "linear-gradient(145deg, #17131d, #4d3b60)"],
] as const;

function PolicyLink({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) return <span className="font-semibold text-primary">{children}</span>;

  return (
    <a className="font-semibold text-primary hover:underline" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function AuthBackdrop() {
  return (
    <div className="absolute inset-0 grid grid-cols-3 gap-1 overflow-hidden bg-black p-1 opacity-65 sm:grid-cols-4">
      {backdropTiles.map(([title, background], index) => (
        <div
          key={title}
          className={cn(
            "relative min-h-36 overflow-hidden rounded-sm border border-white/5",
            index % 4 === 1 && "translate-y-8",
            index % 4 === 3 && "-translate-y-5"
          )}
          style={{ background }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.2),transparent_45%)]" />
          <p className="absolute inset-x-2 bottom-3 text-center text-[11px] font-black tracking-[0.18em] text-white/70">
            {title}
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

  const title = useMemo(() => (mode === "signin" ? "Welcome back" : "Create your account"), [mode]);
  const visibleError = localError ?? error;
  const visibleProviders =
    providerSettingsStatus === "ready"
      ? providers.filter(({ provider }) => enabledSocialProviders.includes(provider))
      : providers;
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
      setLocalError(`${provider === "x" ? "X" : provider} sign-in is not enabled in Supabase.`);
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
      setLocalError("Enter a valid email address.");
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
      setLocalError(`Enter the ${authConfig.otpLength}-digit code sent to your email.`);
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-white/60">Track every story</p>
            <p className="text-3xl font-black tracking-tight">CineTrack</p>
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
                {option === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          {step === "providers" ? (
            <>
              <div className="text-center">
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
                <p className="mt-2 text-sm text-white/55">Continue with a provider or use a one-time code by email.</p>
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-4">
                {visibleProviders.map(({ provider, label, className }) => (
                  <button
                    key={provider}
                    type="button"
                    aria-label={`Continue with ${label}`}
                    title={`Continue with ${label}`}
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
                  aria-label="Continue with email"
                  title="Continue with email"
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
                <p className="mt-4 text-center text-xs text-white/45">Checking configured sign-in providers…</p>
              ) : null}

              {providerSettingsStatus === "ready" && enabledSocialProviders.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-center text-xs leading-5 text-amber-100">
                  No social provider is enabled. Configure one in Supabase or continue with email.
                </p>
              ) : null}

              {providerSettingsStatus === "unavailable" ? (
                <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-center text-xs leading-5 text-amber-100">
                  CineTrack could not verify the provider configuration.
                </p>
              ) : null}
            </>
          ) : null}

          {step === "email" ? (
            <form onSubmit={handleEmailSubmit}>
              <button
                type="button"
                onClick={() => {
                  resetError();
                  setStep("providers");
                }}
                className="mb-7 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" /> Back
              </button>

              <h1 className="text-3xl font-black">{mode === "signin" ? "Sign in by email" : "Create your account"}</h1>
              <p className="mt-2 text-sm text-white/55">We will send a {authConfig.otpLength}-digit one-time code.</p>

              <div className="mt-7 flex items-center gap-3 border-b border-white/45 px-2 pb-3 focus-within:border-primary">
                <Mail className="h-6 w-6 text-white/75" />
                <input
                  autoFocus
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
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
                  <span>Send me optional email updates about my shows and movies.</span>
                </label>
              ) : null}

              <button
                type="submit"
                disabled={pendingAction !== null}
                className="mt-10 flex h-14 w-full items-center justify-center rounded-full bg-primary text-base font-black uppercase tracking-[0.08em] text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {pendingAction === "email" ? <LoaderCircle className="h-6 w-6 animate-spin" /> : "Send code"}
              </button>
            </form>
          ) : null}

          {step === "otp" ? (
            <form onSubmit={handleOtpSubmit}>
              <button
                type="button"
                onClick={() => {
                  resetError();
                  setToken("");
                  setStep("email");
                }}
                className="mb-7 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" /> Change email
              </button>

              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h1 className="mt-5 text-3xl font-black">Check your inbox</h1>
              <p className="mt-2 text-sm text-white/55">
                Enter the {authConfig.otpLength}-digit code sent to {email.trim()}.
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
                aria-label="One-time code"
                className="mt-7 h-16 w-full rounded-2xl border border-white/20 bg-black/30 px-4 text-center text-3xl font-black tracking-[0.3em] text-white outline-none placeholder:text-white/20 focus:border-primary"
              />

              <button
                type="submit"
                disabled={pendingAction !== null}
                className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-primary text-base font-black uppercase tracking-[0.08em] text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {pendingAction === "otp" ? <LoaderCircle className="h-6 w-6 animate-spin" /> : "Verify"}
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
                {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend code"}
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
            By continuing, you agree to CineTrack&apos;s <PolicyLink href={authConfig.termsUrl}>Terms</PolicyLink> and{" "}
            <PolicyLink href={authConfig.privacyUrl}>Privacy Policy</PolicyLink>.
          </p>
        </section>
      </div>
    </div>
  );
}
