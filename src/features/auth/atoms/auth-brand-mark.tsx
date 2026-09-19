import { useTranslation } from "react-i18next";
import { BrandMarkIcon } from "@/components/layout/brand-mark-icon";

// Uses the same BrandMarkIcon as the signed-in app's own sidebar, so the
// brand doesn't switch identity across the sign-in boundary.
export function AuthBrandMark() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      <BrandMarkIcon className="h-10 w-10 ring-1 ring-auth-foreground/15" />
      <div>
        <p className="text-overline font-semibold uppercase text-auth-foreground/50">{t("sidebar.brand.tagline")}</p>
        <p className="text-heading-sm font-bold tracking-tight text-auth-foreground">{t("sidebar.brand.name")}</p>
      </div>
    </div>
  );
}
