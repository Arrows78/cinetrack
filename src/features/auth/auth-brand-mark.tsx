import { useTranslation } from "react-i18next";
import { BrandMarkIcon } from "@/components/layout/brand-mark-icon";

// Shared between AuthScreen and CreateProfileScreen so the sign-in flow
// reads as one continuous scene instead of switching identities mid-flow —
// and uses the same BrandMarkIcon as the signed-in app's own sidebar, so
// the brand doesn't switch identity across the sign-in boundary either.
export function AuthBrandMark() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 drop-shadow-2xl">
      <BrandMarkIcon className="h-14 w-14 ring-1 ring-white/15" />
      <div>
        <p className="text-overline font-semibold uppercase text-auth-foreground/60">{t("sidebar.brand.tagline")}</p>
        <p className="text-3xl font-black tracking-tight text-auth-foreground">{t("sidebar.brand.name")}</p>
      </div>
    </div>
  );
}
