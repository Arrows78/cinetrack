import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, LoaderCircle, Mail } from "lucide-react";

import { Input } from "@/components/ui/input";
import { authConfig } from "@/features/auth/auth-client";
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
      <button
        type="button"
        onClick={onBack}
        className="mb-7 inline-flex items-center gap-2 text-sm text-auth-foreground/60 hover:text-auth-foreground"
      >
        <ArrowLeft className="h-5 w-5" /> {t("auth.email.back")}
      </button>

      <h1 className="text-3xl font-black">
        {mode === "signin" ? t("auth.email.signInByEmail") : t("auth.email.createAccountTitle")}
      </h1>
      <p className="mt-2 text-sm text-auth-foreground/55">
        {t("auth.email.sendCodeDescription", { length: authConfig.otpLength })}
      </p>

      <div className="mt-7 flex items-center gap-3 border-b border-white/45 px-2 pb-3 focus-within:border-primary">
        <Mail className="h-6 w-6 text-auth-foreground/75" />
        <Input
          autoFocus
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder={t("auth.email.placeholder")}
          aria-label={t("auth.email.emailLabel")}
          className="w-auto flex-1 min-w-0 h-auto rounded-lg border-0 bg-transparent px-0 py-0 text-xl text-auth-foreground outline-none placeholder:text-auth-foreground/35 focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

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

      <button
        type="submit"
        disabled={pendingAction !== null}
        className="mt-10 flex h-14 w-full items-center justify-center rounded-full bg-primary text-base font-black uppercase tracking-[0.08em] text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {pendingAction === "email" ? <LoaderCircle className="h-6 w-6 animate-spin" /> : t("auth.email.sendCode")}
      </button>
    </form>
  );
}
