import { useTranslation } from "react-i18next";
import { CalendarDays } from "lucide-react";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { TrackingList } from "@/components/media/tracking/tracking-list";

export function TrackingPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <SectionHeader title={t("tracking.title")} subtitle={t("tracking.description")} icon={CalendarDays} isPageTitle />
      <TrackingList />
    </div>
  );
}
