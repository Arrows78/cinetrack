import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useOnThisDay } from "@/features/stats/use-stats";
import { formatDate } from "@/shared/utils/format";
import { ON_THIS_DAY_INVITE_DISMISSED_KEY } from "@/shared/constants/local-storage-keys";
import type { ViewingEvent } from "@/types/media";

interface YearEntry {
  year: number;
  event: ViewingEvent;
}

// Cheap "delight card" cap — a busy history could in principle match many
// past years on the same month-day, but this is a small, glanceable Home
// surface, not a full history browser, so it's kept to a short list.
const MAX_ENTRIES = 3;

/**
 * One representative event per distinct past year present in `events`
 * (already filtered/ordered most-recent-year-first by the backend — see
 * list_on_this_day_events in src-tauri/src/commands/stats.rs). When a year
 * has more than one match (e.g. a movie and an episode watched the same
 * day), the first one encountered wins — an arbitrary but stable pick,
 * matching the "keep it simple" scope of this v1 card.
 */
function groupByYear(events: ViewingEvent[]): YearEntry[] {
  const seenYears = new Set<number>();
  const entries: YearEntry[] = [];
  for (const event of events) {
    const year = new Date(event.watchedAt).getFullYear();
    if (seenYears.has(year)) continue;
    seenYears.add(year);
    entries.push({ year, event });
  }
  return entries;
}

/**
 * Opt-in "On this day" Home card (see UserPreferences.onThisDayEnabled,
 * toggled in Settings) — surfaces what the user watched on today's date in
 * past years. Self-contained like WeeklyAgendaSection: reads the
 * preference and fetches its own data, so the caller just drops
 * `<OnThisDaySection />` into the page without wiring anything else up.
 *
 * Renders nothing at all when the preference is off or there's no match for
 * today — unlike a real empty state elsewhere in the app, an empty "on this
 * day" isn't itself informative and would just be noise on an ordinary day.
 */
export function OnThisDaySection({ id }: { id?: string }) {
  const { t } = useTranslation();
  const preferencesQuery = usePreferences();
  const enabled = preferencesQuery.data?.onThisDayEnabled ?? false;
  const onThisDayQuery = useOnThisDay(enabled);

  if (!enabled) return null;

  const entries = groupByYear(onThisDayQuery.data ?? []).slice(0, MAX_ENTRIES);
  if (entries.length === 0) return null;

  const currentYear = new Date().getFullYear();

  return (
    <Panel id={id} tone="highlight" className="flex flex-col gap-4 scroll-mt-28 animate-in-up">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="font-display text-heading-sm font-bold tracking-tight">{t("home.onThisDayTitle")}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {entries.map(({ year, event }) => {
          return (
            <li key={`${event.mediaType}-${event.mediaId}-${year}`}>
              <Link
                to={event.mediaType === "movie" ? "/movies/$movieId" : "/series/$seriesId"}
                params={
                  event.mediaType === "movie" ? { movieId: String(event.mediaId) } : { seriesId: String(event.mediaId) }
                }
                className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="text-body-sm font-medium">
                  {t("home.onThisDayEntry", { date: formatDate(event.watchedAt), title: event.title })}
                </p>
                <p className="text-caption text-muted-foreground">
                  {t("home.onThisDayYearsAgo", { count: currentYear - year })}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Discoverability counterpart to OnThisDaySection: while the preference is
 * off, this is the only Home-page hint that the feature exists at all (it's
 * otherwise a single toggle among many in Settings — see settings-page.tsx).
 * Only shows up when there's an actual match for today, same "no noise on an
 * ordinary day" rule as the real card, and can be dismissed for the day
 * (see ON_THIS_DAY_INVITE_DISMISSED_KEY) without disabling the underlying
 * preference — dismissing the invite isn't the same as opting out forever.
 */
export function OnThisDayInviteBanner({ id }: { id?: string }) {
  const { t } = useTranslation();
  const preferencesQuery = usePreferences();
  const enabled = preferencesQuery.data?.onThisDayEnabled ?? false;
  const [dismissedAt, setDismissedAt] = useState(() => localStorage.getItem(ON_THIS_DAY_INVITE_DISMISSED_KEY));

  const canShow = preferencesQuery.data !== undefined && !enabled && dismissedAt !== todayKey();
  const onThisDayQuery = useOnThisDay(canShow);

  if (!canShow) return null;

  const entries = groupByYear(onThisDayQuery.data ?? []).slice(0, MAX_ENTRIES);
  if (entries.length === 0) return null;

  const dismiss = () => {
    const key = todayKey();
    localStorage.setItem(ON_THIS_DAY_INVITE_DISMISSED_KEY, key);
    setDismissedAt(key);
  };

  return (
    <Panel
      id={id}
      tone="highlight"
      className="flex flex-wrap items-center justify-between gap-4 scroll-mt-28 animate-in-up"
    >
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-semibold">{t("home.onThisDayInviteTitle")}</p>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {t("home.onThisDayInviteDesc", { count: entries.length })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void preferencesQuery.updatePreference({ key: "onThisDayEnabled", value: true })}
        >
          {t("home.onThisDayInviteCta")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("home.onThisDayInviteDismiss")}
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Panel>
  );
}
