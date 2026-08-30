import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { addMonths, format, parseISO, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Clapperboard, Download, Film, Tv } from "lucide-react";
import { useMonthlyRecap } from "@/features/stats/use-stats";
import { ShareCancelledError, downloadMonthlyRecapCard, renderMonthlyRecapCard } from "@/features/stats";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { IconTooltip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import { logger } from "@/shared/lib/logger";
import { displayMessage } from "@/shared/lib/user-facing-error";
import { formatDate, formatWatchDurationBreakdown } from "@/shared/utils/format";

function currentMonthLabel(): string {
  return format(new Date(), "yyyy-MM");
}

function shiftMonth(month: string, delta: number): string {
  const monthDate = parseISO(`${month}-01`);
  return format(delta > 0 ? addMonths(monthDate, delta) : subMonths(monthDate, -delta), "yyyy-MM");
}

/**
 * Monthly recap panel for the Stats page — like Wrapped, this is a
 * historical breakdown ("what did I watch this month") rather than a
 * current-state total, so it counts every watched/rewatched event that fell
 * in the selected month, not a dedupe-to-latest-event total the way the
 * headline stats cards above it are.
 */
export function MonthlyRecapSection() {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(currentMonthLabel);
  const [isExporting, setIsExporting] = useState(false);
  const recap = useMonthlyRecap(month);

  useEffect(() => {
    if (recap.isError) {
      logger.warn(
        `Monthly recap failed to load: ${recap.error instanceof Error ? recap.error.message : String(recap.error)}`
      );
    }
  }, [recap.isError, recap.error]);

  if (recap.isError || !recap.data) return null;

  const data = recap.data;
  const monthLabel = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }).format(
    parseISO(`${month}-01`)
  );
  const isCurrentMonth = month === currentMonthLabel();

  const exportRecap = async () => {
    setIsExporting(true);
    try {
      const blob = await renderMonthlyRecapCard(
        {
          monthLabel,
          timeWatchedLabel: formatWatchDurationBreakdown(data.minutesWatched),
          moviesEpisodesLabel: `${data.moviesWatched} ${t("stats.films")} · ${data.episodesWatched} ${t("stats.episodes")}`,
          topRatedTitle: data.topRatedTitle
            ? `${data.topRatedTitle.title} · ${data.topRatedTitle.rating.toFixed(1)}`
            : null,
          favouriteGenre: data.favouriteGenre,
          biggestBinge: data.biggestBingeDay
            ? `${t("stats.watchCount", { count: data.biggestBingeDay.count })} · ${formatDate(data.biggestBingeDay.day)}`
            : null,
        },
        {
          brand: t("sidebar.brand.name"),
          tagline: t("sidebar.brand.tagline"),
          recapTitle: t("stats.monthlyRecap.title"),
          topRatedTitleLabel: t("stats.monthlyRecap.topRatedTitleCardLabel"),
          favouriteGenreLabel: t("stats.monthlyRecap.favouriteGenreCardLabel"),
          biggestBingeLabel: t("stats.monthlyRecap.biggestBingeCardLabel"),
        }
      );
      await downloadMonthlyRecapCard(blob, month);
      toast({ description: t("stats.monthlyRecap.exportSuccess"), variant: "success" });
    } catch (error) {
      if (error instanceof ShareCancelledError) return;
      logger.warn(`Monthly recap export failed: ${error instanceof Error ? error.message : String(error)}`);
      toast({ description: displayMessage(error, t("stats.monthlyRecap.exportFailed")), variant: "error" });
    } finally {
      setIsExporting(false);
    }
  };

  const tiles = [
    { label: t("stats.moviesWatched"), value: String(data.moviesWatched), icon: Film },
    { label: t("stats.episodesWatched"), value: String(data.episodesWatched), icon: Tv },
    { label: t("stats.timeWatched"), value: formatWatchDurationBreakdown(data.minutesWatched), icon: Clapperboard },
  ];

  return (
    <Panel>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-heading-sm">{t("stats.monthlyRecap.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          <IconTooltip label={t("stats.monthlyRecap.export")}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("stats.monthlyRecap.export")}
              disabled={isExporting}
              onClick={() => void exportRecap()}
            >
              <Download className="size-4" />
            </Button>
          </IconTooltip>
          <IconTooltip label={t("stats.previousMonth")}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("stats.previousMonth")}
              onClick={() => setMonth((current) => shiftMonth(current, -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
          </IconTooltip>
          <IconTooltip label={t("stats.nextMonth")}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("stats.nextMonth")}
              disabled={isCurrentMonth}
              onClick={() => setMonth((current) => shiftMonth(current, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </IconTooltip>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {tiles.map(({ label, value, icon: Icon }) => (
          <Tile key={label} className="p-3">
            <Icon className="size-4 text-primary" aria-hidden="true" />
            <p className="mt-2 text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 truncate font-display text-xl font-bold">{value}</p>
          </Tile>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Tile className="min-w-0 p-3">
          <p className="text-xs text-muted-foreground">{t("stats.monthlyRecap.topRatedTitle")}</p>
          <p className="mt-1 truncate font-medium" title={data.topRatedTitle?.title}>
            {data.topRatedTitle ? `${data.topRatedTitle.title} · ${data.topRatedTitle.rating.toFixed(1)}` : "—"}
          </p>
        </Tile>
        <Tile className="min-w-0 p-3">
          <p className="text-xs text-muted-foreground">{t("stats.monthlyRecap.favouriteGenre")}</p>
          <p className="mt-1 truncate font-medium">{data.favouriteGenre ?? "—"}</p>
        </Tile>
        <Tile className="min-w-0 p-3">
          <p className="text-xs text-muted-foreground">{t("stats.biggestBinge")}</p>
          <p className="mt-1 truncate font-medium">
            {data.biggestBingeDay
              ? `${t("stats.watchCount", { count: data.biggestBingeDay.count })} · ${formatDate(data.biggestBingeDay.day)}`
              : "—"}
          </p>
        </Tile>
      </div>
    </Panel>
  );
}
