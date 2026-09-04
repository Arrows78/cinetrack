import { useTranslation } from "react-i18next";
import { MediaGrid } from "@/components/media/primitives/media-grid";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { filterHiddenIfWatched } from "@/shared/utils/library-set";
import type { HomeFeed, LibraryItem, MediaSummary } from "@/types/media";
import { CATALOGUE_SECTIONS } from "./catalogue-sections-data";

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
