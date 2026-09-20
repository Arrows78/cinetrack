import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LibraryBig, Popcorn, Sparkles, Tv } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tile } from "@/components/ui/tile";
import { usePreferences } from "@/features/preferences/use-preferences";
import { router } from "@/app/router-config";

interface OnboardingChoice {
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
  to: string;
  // Only the TV Time choice needs this today — it deep-links straight to
  // the TvTimeImportCard inside Settings' Data section (SETTINGS_DATA_ID)
  // instead of just landing on top of the page, since that's the whole
  // point of surfacing it here rather than leaving it "noyé dans les
  // Paramètres" per the audit that added this choice.
  hash?: string;
}

// Destinations all already exist and already handle a brand-new, empty
// profile: /settings#settings-data scrolls straight to the TV Time import
// card, /search is the library's own existing empty-state CTA target, and
// /watch-tonight's catalogue-discover fallback works with nothing planned
// yet. This replaces a formerly generic "I'm importing my history" tile
// that already only ever meant TV Time (its own description said so) but
// buried that behind generic copy and a plain /settings landing.
const CHOICES: OnboardingChoice[] = [
  {
    icon: Tv,
    titleKey: "onboarding.tvTimeTitle",
    descriptionKey: "onboarding.tvTimeDescription",
    to: "/settings",
    hash: "settings-data",
  },
  {
    icon: LibraryBig,
    titleKey: "onboarding.newLibraryTitle",
    descriptionKey: "onboarding.newLibraryDescription",
    to: "/search",
  },
  {
    icon: Popcorn,
    titleKey: "onboarding.pickTonightTitle",
    descriptionKey: "onboarding.pickTonightDescription",
    to: "/watch-tonight",
  },
];

// Not the Auth module's cinematic dark theme (AuthScreen/CreateProfileScreen
// deliberately reserve that for the pre-app sign-in flow) — this is the
// app's own first-run welcome, styled with the same tokens as Home's
// existing "no token" centered empty state.
export function OnboardingScreen() {
  const { t } = useTranslation();
  const { updatePreference } = usePreferences();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(false);

  const choose = (choice: OnboardingChoice) => {
    setError(false);
    setIsSaving(true);
    // The router isn't mounted yet while this screen shows (AppRouter only
    // renders once this gate lets `children` through) — navigating through
    // the singleton, same as desktop-service.ts's deep-link handler, rather
    // than useNavigate()/<Link>, which need a live router context.
    void router.navigate({ to: choice.to as never, hash: choice.hash });
    void updatePreference({ key: "onboardingCompleted", value: true })
      .catch(() => setError(true))
      .finally(() => setIsSaving(false));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="mx-auto w-full max-w-2xl text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-foreground/[0.04] text-muted-foreground/60">
          <Sparkles className="h-7 w-7" />
        </div>
        <h1 className="font-display text-heading-lg font-bold tracking-tight">{t("onboarding.title")}</h1>
        <p className="mx-auto mt-3 max-w-md text-body-sm leading-relaxed text-muted-foreground">
          {t("onboarding.subtitle")}
        </p>

        <div className="mt-8 grid gap-4 text-left">
          {CHOICES.map((choice) => (
            <Tile
              asChild
              key={choice.to}
              className="bg-foreground/[0.03] p-4 transition-colors hover:bg-foreground/[0.04]"
            >
              <button
                type="button"
                disabled={isSaving}
                onClick={() => choose(choice)}
                className="w-full text-left disabled:cursor-not-allowed disabled:opacity-60"
              >
                <choice.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <p className="mt-3 font-semibold">{t(choice.titleKey)}</p>
                <p className="mt-1 text-body-sm text-muted-foreground">{t(choice.descriptionKey)}</p>
              </button>
            </Tile>
          ))}
        </div>

        {error ? (
          <p role="alert" aria-live="polite" className="mt-6 text-body-sm text-destructive">
            {t("onboarding.error")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
