import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

/**
 * Contextual counterpart to the global, fixed OfflineIndicator: rendered
 * next to the specific section whose data is stale (see
 * isDegradedRemoteError), so it's clear which content is cached rather than
 * a blanket "you are offline" state with no link to what's on screen.
 */
export function DegradedModeBadge() {
  const { t } = useTranslation();
  return (
    <Badge variant="warning" className="gap-1.5">
      <WifiOff className="size-3" />
      {t("offline.message")}
    </Badge>
  );
}
