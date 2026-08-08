import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, LoaderCircle, RotateCw, ShieldCheck } from "lucide-react";

import { authConfig } from "@/features/auth/auth-client";

interface AuthOtpStepProps {
  email: string;
  token: string;
  pendingAction: string | null;
  resendSeconds: number;
  onTokenChange: (token: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResend: () => void;
  onBack: () => void;
}

export function AuthOtpStep({
  email,
  token,
  pendingAction,
  resendSeconds,
  onTokenChange,
  onSubmit,
  onResend,
  onBack,
}: AuthOtpStepProps) {
  const { t } = useTranslation();

  return (
    <form onSubmit={onSubmit}>
      <button
        type="button"
        onClick={onBack}
        className="mb-7 inline-flex items-center gap-2 text-sm text-auth-foreground/60 hover:text-auth-foreground"
      >
        <ArrowLeft className="h-5 w-5" /> {t("auth.email.changeEmail")}
      </button>

      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-3xl font-black">{t("auth.otp.checkInbox")}</h1>
      <p className="mt-2 text-sm text-auth-foreground/55">
        {t("auth.otp.enterCode", { length: authConfig.otpLength, email: email.trim() })}
      </p>

      <input
        autoFocus
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        value={token}
        maxLength={authConfig.otpLength}
        onChange={(event) => onTokenChange(event.target.value.replace(/\D/g, "").slice(0, authConfig.otpLength))}
        placeholder={"0".repeat(authConfig.otpLength)}
        aria-label={t("auth.otp.ariaLabel")}
        className="mt-7 h-16 w-full rounded-2xl border border-white/20 bg-black/30 px-4 text-center text-3xl font-black tracking-[0.3em] text-auth-foreground outline-none placeholder:text-auth-foreground/20 focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
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
        onClick={onResend}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-auth-foreground/65 transition hover:bg-white/5 hover:text-auth-foreground disabled:cursor-not-allowed disabled:opacity-45"
      >
        {pendingAction === "resend" ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <RotateCw className="h-4 w-4" />
        )}
        {resendSeconds > 0 ? t("auth.otp.resendIn", { seconds: resendSeconds }) : t("auth.otp.resendCode")}
      </button>
    </form>
  );
}
