import { useTranslation } from "react-i18next";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAvailabilityAlert } from "@/features/availability/use-availability-alerts";
import { usePreferences } from "@/features/preferences/use-preferences";
import { notificationService } from "@/features/desktop/notification-service";
import { DEFAULT_TMDB_REGION } from "@/shared/constants/discover";
import type { MediaSummary } from "@/types/media";

export function AvailabilityAlertButton({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const preferences = usePreferences();
  const region = preferences.data?.region ?? DEFAULT_TMDB_REGION;
  const providers = preferences.data?.preferredProviderIds ?? [];
  const alert = useAvailabilityAlert(media, region, providers);

  const toggle = async () => {
    if (!alert.data && !(await notificationService.requestPermission())) return;
    await alert.toggle();
  };

  return (
    <Button
      type="button"
      variant={alert.data ? "secondary" : "outline"}
      isLoading={alert.isSaving}
      disabled={alert.isSaving}
      onClick={() => void toggle()}
    >
      {alert.data ? <BellOff className="mr-2 size-4" /> : <Bell className="mr-2 size-4" />}
      {alert.data ? t("media.disableAlert") : t("media.availabilityAlert")}
    </Button>
  );
}
