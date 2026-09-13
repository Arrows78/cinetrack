import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tile } from "@/components/ui/tile";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { toast } from "@/components/ui/use-toast";
import { useDismissedRecommendations } from "@/features/recommendations/use-recommendations";
import { logger } from "@/shared/lib/logger";
import { displayMessage } from "@/shared/lib/user-facing-error";

/**
 * Transparency/reversibility for the "Pas intéressé" action
 * (NotInterestedButton) — a dismissal has no other UI anywhere, so without
 * this a title excluded from recommendations would stay hidden forever
 * with no way back.
 */
export function HiddenTitlesCard() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch, undismiss, isUndismissing } = useDismissedRecommendations();

  const restore = (item: { mediaId: number; mediaType: "movie" | "series"; title: string }) => {
    undismiss({ mediaId: item.mediaId, mediaType: item.mediaType })
      .then(() => {
        toast({
          description: t("recommendations.hiddenTitles.restoredToast", { title: item.title }),
          variant: "success",
        });
      })
      .catch((restoreError: unknown) => {
        logger.warn(
          `Failed to restore a dismissed recommendation: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`
        );
        toast({
          description: displayMessage(restoreError, t("recommendations.hiddenTitles.restoreFailed")),
          variant: "error",
        });
      });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("recommendations.hiddenTitles.title")}</CardTitle>
        <CardDescription>{t("recommendations.hiddenTitles.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isError ? (
          <RemoteErrorState error={error} onRetry={() => void refetch()} />
        ) : !isLoading && (data ?? []).length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{t("recommendations.hiddenTitles.empty")}</p>
        ) : (
          <div className="grid gap-2">
            {(data ?? []).map((item) => (
              <Tile key={item.id} className="flex items-center justify-between gap-3 p-3">
                <p className="min-w-0 truncate font-medium">{item.title}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUndismissing}
                  onClick={() => restore(item)}
                >
                  {t("recommendations.hiddenTitles.restore")}
                </Button>
              </Tile>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
