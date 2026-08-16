import { useTranslation } from "react-i18next";
import { Clapperboard } from "lucide-react";

// Shared between AuthScreen and CreateProfileScreen so the sign-in flow
// reads as one continuous scene instead of switching identities mid-flow.
export function AuthBrandMark() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 drop-shadow-2xl">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent ring-1 ring-white/15">
        <Clapperboard className="h-7 w-7 text-primary-foreground" aria-hidden="true" />
      </div>
      <div>
        <p className="text-overline font-semibold uppercase text-auth-foreground/60">{t("sidebar.brand.tagline")}</p>
        <p className="text-3xl font-black tracking-tight text-auth-foreground">{t("sidebar.brand.name")}</p>
      </div>
    </div>
  );
}
