import { useTranslation } from "react-i18next";
import { LibraryExplorer } from "@/components/media/library/library-explorer";
import { SectionHeader } from "@/components/media/primitives/section-header";

export function LibraryPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <SectionHeader title={t("library.myLibrary")} subtitle={t("library.subtitle")} index={1} isPageTitle />
      <LibraryExplorer />
    </div>
  );
}
