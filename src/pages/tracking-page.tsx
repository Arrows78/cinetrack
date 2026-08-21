import { useTranslation } from "react-i18next";
import { CalendarDays } from "lucide-react";
import { TrackingList } from "@/components/media/tracking-list";
import { staggerDelayMs } from "@/shared/utils/animation";

export function TrackingPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <header className="animate-in" style={{ animationDelay: `${staggerDelayMs(0)}ms` }}>
        <div className="flex items-center gap-3">
          <CalendarDays className="size-7 text-primary" />
          <h1 className="font-display text-3xl font-bold">{t("tracking.title")}</h1>
        </div>
        <p className="mt-1 text-muted-foreground">{t("tracking.description")}</p>
      </header>
      <TrackingList />
    </div>
  );
}
