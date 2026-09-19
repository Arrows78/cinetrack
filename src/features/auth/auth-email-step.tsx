import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Mail } from "lucide-react";

import { authConfig } from "@/features/auth/auth-client";
import { AuthBackLink } from "@/features/auth/atoms/auth-back-link";
import { AuthTextField } from "@/features/auth/atoms/auth-text-field";
import { Button } from "@/components/ui/button";
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

      <h1 className="text-heading-lg font-bold tracking-tight">
        {mode === "signin" ? t("auth.email.signInByEmail") : t("auth.email.createAccountTitle")}
      </h1>
      <p className="mt-2 text-body-sm leading-6 text-auth-foreground/55">
        {t("auth.email.sendCodeDescription", { length: authConfig.otpLength })}
      </p>

      <label className="mt-7 block">
        <span className="mb-2 block text-body-sm font-medium text-auth-foreground/70">
          {t("auth.email.emailLabel")}
        </span>
        <AuthTextField
          icon={Mail}
          // This step's sole field: autofocusing it is the expected behavior for
          // a single-field auth step, not a distraction.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder={t("auth.email.placeholder")}
        />
      </label>

      {mode === "signup" ? (
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-body-sm text-auth-foreground/75">
          <button
            type="button"
            role="checkbox"
            aria-checked={marketingOptIn}
            onClick={onMarketingOptInToggle}
            className={cn(
              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition",
              marketingOptIn
                ? "border-primary bg-primary text-primary-foreground"
                : "border-auth-foreground/35 bg-transparent"
            )}
          >
            {marketingOptIn ? <Check className="size-3.5" /> : null}
          </button>
          <span>{t("auth.email.marketingOptIn")}</span>
        </label>
      ) : null}

      <Button
        type="submit"
        variant="authPrimary"
        size="auth"
        className="mt-7"
        disabled={pendingAction !== null}
        isLoading={pendingAction === "email"}
      >
        {t("auth.email.sendCode")}
      </Button>
    </form>
  );
}
