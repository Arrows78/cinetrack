import { Bell,BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAvailabilityAlert } from "@/hooks/use-availability-alerts";
import { usePreferences } from "@/hooks/use-local-media";
import { notificationService } from "@/services/notification-service";
import type { MediaSummary } from "@/types/media";

export function AvailabilityAlertButton({ media }: { media: MediaSummary }) {
  const preferences = usePreferences();
  const region = preferences.data?.region ?? "FR";
  const providers = preferences.data?.preferredProviderIds ?? [];
  const alert = useAvailabilityAlert(media, region, providers);

  const toggle = async () => {
    if (!alert.data && !(await notificationService.requestPermission())) return;
    await alert.toggle();
  };

  return (
    <Button type="button" variant={alert.data ? "secondary" : "outline"} disabled={alert.isSaving} onClick={() => void toggle()}>
      {alert.data ? <BellOff className="mr-2 size-4" /> : <Bell className="mr-2 size-4" />}
      {alert.data ? "Désactiver l’alerte" : "Alerte de disponibilité"}
    </Button>
  );
}
