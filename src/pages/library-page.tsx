import { useTranslation } from "react-i18next";
import { LibraryBig } from "lucide-react";
import { LibraryExplorer } from "@/components/media/library/library-explorer";
import { SectionHeader } from "@/components/media/primitives/section-header";

export function LibraryPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <SectionHeader title={t("library.myLibrary")} subtitle={t("library.subtitle")} icon={LibraryBig} isPageTitle />
      <LibraryExplorer />
    </div>
  );
}
