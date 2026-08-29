import { useTranslation } from "react-i18next";
import { MediaGrid } from "@/components/media/media-grid";
import { SectionHeader } from "@/components/media/section-header";
import { filterHiddenIfWatched } from "@/shared/utils/library-set";
import type { HomeFeed, LibraryItem, MediaSummary } from "@/types/media";

export const CATALOGUE_SECTIONS = [
  { key: "trendingSeries", titleKey: "home.trendingSeries", subtitleKey: "home.trendingSeriesSubtitle" },
  { key: "topRatedSeries", titleKey: "home.topRatedSeries", subtitleKey: "home.topRatedSeriesSubtitle" },
  { key: "onTheAirSeries", titleKey: "home.onTheAirSeries", subtitleKey: "home.onTheAirSeriesSubtitle" },
  { key: "trendingMovies", titleKey: "home.trendingMovies", subtitleKey: "home.trendingMoviesSubtitle" },
  { key: "topRatedMovies", titleKey: "home.topRatedMovies", subtitleKey: "home.topRatedMoviesSubtitle" },
  { key: "nowPlayingMovies", titleKey: "home.nowPlayingMovies", subtitleKey: "home.nowPlayingMoviesSubtitle" },
  { key: "upcomingMovies", titleKey: "home.upcomingMovies", subtitleKey: "home.upcomingMoviesSubtitle" },
] as const satisfies ReadonlyArray<{ key: keyof HomeFeed; titleKey: string; subtitleKey: string }>;

// Shared between the home dashboard and Search's default (no-query) browse
// state so both stay in lockstep — see CLAUDE.md's rule against
// hand-duplicated lists/markup. `hideWatched`/`library` are optional and
// default to "no filtering" so Search's own usage (which doesn't wire the
// "Hide watched" toggle) keeps behaving exactly as before.
export function CatalogueSections({
  feed,
  startIndex,
  hideWatched = false,
  library = [],
}: {
  feed: HomeFeed | undefined;
  startIndex: number;
  hideWatched?: boolean;
  library?: LibraryItem[];
}) {
  const { t } = useTranslation();

  return (
    <>
      {CATALOGUE_SECTIONS.map((section, i) => (
        <section key={section.key}>
          <SectionHeader title={t(section.titleKey)} subtitle={t(section.subtitleKey)} index={startIndex + i} />
          <MediaGrid
            items={filterHiddenIfWatched((feed?.[section.key] ?? []) as MediaSummary[], library, hideWatched)}
          />
        </section>
      ))}
    </>
  );
}
