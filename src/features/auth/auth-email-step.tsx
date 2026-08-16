import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Mail } from "lucide-react";

import { authConfig } from "@/features/auth/auth-client";
import { AuthBackLink } from "@/features/auth/auth-back-link";
import { AuthSubmitButton } from "@/features/auth/auth-submit-button";
import { AuthTextField } from "@/features/auth/auth-text-field";
import { cn } from "@/shared/lib/cn";

interface AuthEmailStepProps {
  mode: "signin" | "signup";
  email: string;
  marketingOptIn: boolean;
  pendingAction: string | null;
  onEmailChange: (email: string) => void;
  onMarketingOptInToggle: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

export function AuthEmailStep({
  mode,
  email,
  marketingOptIn,
  pendingAction,
  onEmailChange,
  onMarketingOptInToggle,
  onSubmit,
  onBack,
}: AuthEmailStepProps) {
  const { t } = useTranslation();

  return (
    <form onSubmit={onSubmit}>
      <AuthBackLink onClick={onBack}>{t("auth.email.back")}</AuthBackLink>

      <h1 className="text-3xl font-black">
        {mode === "signin" ? t("auth.email.signInByEmail") : t("auth.email.createAccountTitle")}
      </h1>
      <p className="mt-2 text-sm text-auth-foreground/55">
        {t("auth.email.sendCodeDescription", { length: authConfig.otpLength })}
      </p>

      <AuthTextField
        rowClassName="mt-7"
        icon={Mail}
        autoFocus
        required
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => onEmailChange(event.target.value)}
        placeholder={t("auth.email.placeholder")}
        aria-label={t("auth.email.emailLabel")}
      />

      {mode === "signup" ? (
        <label className="mt-7 flex cursor-pointer items-start gap-3 text-sm text-auth-foreground/75">
          <button
            type="button"
            role="checkbox"
            aria-checked={marketingOptIn}
            onClick={onMarketingOptInToggle}
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition",
              marketingOptIn ? "border-primary bg-primary text-primary-foreground" : "border-white/60 bg-transparent"
            )}
          >
            {marketingOptIn ? <Check className="h-4 w-4" /> : null}
          </button>
          <span>{t("auth.email.marketingOptIn")}</span>
        </label>
      ) : null}

      <AuthSubmitButton className="mt-10" disabled={pendingAction !== null} loading={pendingAction === "email"}>
        {t("auth.email.sendCode")}
      </AuthSubmitButton>
    </form>
  );
}
