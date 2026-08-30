import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { LoaderCircle, RotateCw, ShieldCheck } from "lucide-react";

import { authConfig } from "@/features/auth/auth-client";
import { AuthBackLink } from "@/features/auth/atoms/auth-back-link";
import { AuthStepIcon } from "@/features/auth/atoms/auth-step-icon";
import { Button } from "@/components/ui/button";

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
      <AuthBackLink onClick={onBack}>{t("auth.email.changeEmail")}</AuthBackLink>

      <AuthStepIcon icon={ShieldCheck} />
      <h1 className="mt-5 text-3xl font-black">{t("auth.otp.checkInbox")}</h1>
      <p className="mt-2 text-sm text-auth-foreground/55">
        {t("auth.otp.enterCode", { length: authConfig.otpLength, email: email.trim() })}
      </p>

      <input
        // This step's sole field: autofocusing it is the expected behavior for
        // a single-field auth step, not a distraction.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        value={token}
        maxLength={authConfig.otpLength}
        onChange={(event) => onTokenChange(event.target.value.replace(/\D/g, "").slice(0, authConfig.otpLength))}
        placeholder={"0".repeat(authConfig.otpLength)}
        aria-label={t("auth.otp.ariaLabel")}
        className="mt-7 h-16 w-full rounded-2xl border border-white/20 bg-black/30 px-4 text-center text-3xl font-black tracking-[0.3em] text-auth-foreground placeholder:text-auth-foreground/20 focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />

      <Button
        type="submit"
        variant="authPrimary"
        size="auth"
        className="mt-6"
        disabled={pendingAction !== null}
        isLoading={pendingAction === "otp"}
      >
        {t("auth.otp.verify")}
      </Button>

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
