import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { LoaderCircle, Mail } from "lucide-react";

import type { SocialAuthProvider } from "@/features/auth/auth-client";
import { ProviderIcon } from "@/features/auth/atoms/provider-icon";
import { cn } from "@/shared/lib/cn";
import { OAUTH_BRAND_COLORS } from "@/shared/constants/colors";

export type ProviderSettingsStatus = "loading" | "ready" | "unavailable";

const providerIds: Array<{
  provider: SocialAuthProvider;
  className: string;
  style?: CSSProperties;
}> = [
  { provider: "apple", className: "bg-white text-black" },
  { provider: "facebook", className: "text-white", style: { backgroundColor: OAUTH_BRAND_COLORS.facebook } },
  { provider: "google", className: "bg-white text-black" },
  { provider: "x", className: "bg-white text-black" },
];

interface AuthProvidersStepProps {
  title: string;
  pendingAction: string | null;
  providerSettingsStatus: ProviderSettingsStatus;
  enabledSocialProviders: SocialAuthProvider[];
  onProvider: (provider: SocialAuthProvider) => void;
  onEmail: () => void;
}

export function AuthProvidersStep({
  title,
  pendingAction,
  providerSettingsStatus,
  enabledSocialProviders,
  onProvider,
  onEmail,
}: AuthProvidersStepProps) {
  const { t } = useTranslation();

  const visibleProviders =
    providerSettingsStatus === "ready"
      ? providerIds.filter(({ provider }) => enabledSocialProviders.includes(provider))
      : providerIds;

  return (
    <>
      <div className="text-center">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-auth-foreground/55">{t("auth.continueWithProviderOrEmail")}</p>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-4">
        {visibleProviders.map(({ provider, className, style }) => (
          <button
            key={provider}
            type="button"
            aria-label={t("auth.provider.continueWith", { label: provider === "x" ? "X" : provider })}
            title={t("auth.provider.continueWith", { label: provider === "x" ? "X" : provider })}
            disabled={pendingAction !== null || providerSettingsStatus === "loading"}
            onClick={() => onProvider(provider)}
            style={style}
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-full shadow-xl transition hover:-translate-y-1 disabled:cursor-wait disabled:opacity-60 sm:h-[4.5rem] sm:w-[4.5rem]",
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
          onClick={onEmail}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition hover:-translate-y-1 disabled:opacity-60 sm:h-[4.5rem] sm:w-[4.5rem]"
        >
          <Mail className="h-8 w-8" />
        </button>
      </div>

      {providerSettingsStatus === "loading" ? (
        <p className="mt-4 text-center text-xs text-auth-foreground/45">{t("auth.status.checkingProviders")}</p>
      ) : null}

      {providerSettingsStatus === "ready" && enabledSocialProviders.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-center text-xs leading-5 text-auth-foreground/90">
          {t("auth.status.noProvidersEnabled")}
        </p>
      ) : null}

      {providerSettingsStatus === "unavailable" ? (
        <p className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-center text-xs leading-5 text-auth-foreground/90">
          {t("auth.status.providerConfigError")}
        </p>
      ) : null}
    </>
  );
}
