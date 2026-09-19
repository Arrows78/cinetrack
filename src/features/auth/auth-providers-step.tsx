import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { LoaderCircle, Mail } from "lucide-react";

import type { SocialAuthProvider } from "@/features/auth/auth-client";
import { ProviderIcon } from "@/features/auth/atoms/provider-icon";
import { cn } from "@/shared/lib/cn";
import { OAUTH_BRAND_COLORS } from "@/shared/constants/colors";

export type ProviderSettingsStatus = "loading" | "ready" | "unavailable";

// Apple, Google and X's own sign-in button guidelines call for a plain
// white (or black) button with the brand mark doing the identifying —
// never a brand-colored fill. Facebook's guideline is the opposite: a
// solid brand-blue button. Both are externally fixed by each platform, not
// a CineTrack design choice (see CLAUDE.md's "reference colors" exception)
// — the plain bg-white/text-black here isn't an inconsistency to unify
// with OAUTH_BRAND_COLORS.facebook, it's a different provider's own rule.
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
      <div>
        <h1 className="text-heading-lg font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-body-sm leading-6 text-auth-foreground/55">{t("auth.continueWithProviderOrEmail")}</p>
      </div>

      <div className="mt-8 flex flex-col gap-2.5">
        {visibleProviders.map(({ provider, className, style }) => {
          const label = t(`auth.provider.names.${provider}`);
          const isPending = pendingAction === provider;

          return (
            <button
              key={provider}
              type="button"
              aria-label={t("auth.provider.continueWith", { label })}
              disabled={pendingAction !== null || providerSettingsStatus === "loading"}
              onClick={() => onProvider(provider)}
              style={style}
              className={cn(
                "flex h-12 w-full items-center justify-center gap-3 rounded-xl text-body-sm font-semibold transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60",
                className
              )}
            >
              {isPending ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <ProviderIcon provider={provider} className="size-5" />
              )}
              <span>{t("auth.provider.continueWith", { label })}</span>
            </button>
          );
        })}
      </div>

      <div className="my-6 flex items-center gap-3 text-caption uppercase tracking-wider text-auth-foreground/40">
        <span className="h-px flex-1 bg-auth-foreground/10" />
        {t("auth.or")}
        <span className="h-px flex-1 bg-auth-foreground/10" />
      </div>

      <button
        type="button"
        aria-label={t("auth.emailButton.ariaLabel")}
        disabled={pendingAction !== null}
        onClick={onEmail}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-auth-foreground/15 bg-auth-background/40 text-body-sm font-semibold text-auth-foreground transition hover:bg-auth-foreground/5 disabled:opacity-60"
      >
        <Mail className="size-5" aria-hidden="true" />
        {t("auth.emailButton.title")}
      </button>

      {providerSettingsStatus === "loading" ? (
        <p className="mt-4 text-center text-caption text-auth-foreground/45">{t("auth.status.checkingProviders")}</p>
      ) : null}

      {providerSettingsStatus === "ready" && enabledSocialProviders.length === 0 ? (
        <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-center text-caption leading-5 text-auth-foreground/90">
          {t("auth.status.noProvidersEnabled")}
        </p>
      ) : null}

      {providerSettingsStatus === "unavailable" ? (
        <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-center text-caption leading-5 text-auth-foreground/90">
          {t("auth.status.providerConfigError")}
        </p>
      ) : null}
    </>
  );
}
