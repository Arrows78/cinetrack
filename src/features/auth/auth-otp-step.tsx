import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { LoaderCircle, RotateCw } from "lucide-react";

import { authConfig } from "@/features/auth/auth-client";
import { AuthBackLink } from "@/features/auth/atoms/auth-back-link";
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

      <h1 className="text-heading-lg font-bold tracking-tight">{t("auth.otp.checkInbox")}</h1>
      <p className="mt-2 text-body-sm leading-6 text-auth-foreground/55">
        {t("auth.otp.enterCode", { length: authConfig.otpLength, email: email.trim() })}
      </p>

      <label className="mt-7 block">
        <span className="mb-2 block text-body-sm font-medium text-auth-foreground/70">{t("auth.otp.ariaLabel")}</span>
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
          className="h-12 w-full rounded-xl border border-auth-foreground/15 bg-auth-background/40 px-4 text-center text-heading-lg font-semibold tracking-[0.28em] text-auth-foreground placeholder:text-auth-foreground/20 focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </label>

      <Button
        type="submit"
        variant="authPrimary"
        size="auth"
        className="mt-7"
        disabled={pendingAction !== null}
        isLoading={pendingAction === "otp"}
      >
        {t("auth.otp.verify")}
      </Button>

      <button
        type="button"
        disabled={pendingAction !== null || resendSeconds > 0}
        onClick={onResend}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-body-sm font-semibold text-auth-foreground/65 transition hover:bg-auth-foreground/5 hover:text-auth-foreground disabled:cursor-not-allowed disabled:opacity-45"
      >
        {pendingAction === "resend" ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <RotateCw className="size-4" />
        )}
        {resendSeconds > 0 ? t("auth.otp.resendIn", { seconds: resendSeconds }) : t("auth.otp.resendCode")}
      </button>
    </form>
  );
}
