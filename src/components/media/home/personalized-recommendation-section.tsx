import { useTranslation } from "react-i18next";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { MediaGrid } from "@/components/media/primitives/media-grid";
import { PeopleYouWatchRails, type PeopleYouWatchRailsProps } from "@/components/media/detail/people-you-watch-rails";
import type { MergedGenre } from "@/features/media/use-merged-genres";
import type { MediaSummary } from "@/types/media";

export interface PersonalizedRecommendationSectionProps {
  becauseYouLiked: { seedTitle: string | null; items: MediaSummary[] };
  favouriteGenreRail: { genre: MergedGenre | null; items: MediaSummary[] };
  peopleYouWatch: PeopleYouWatchRailsProps;
}

// Every existing personalized-signal rail (previously grouped under the
// page-level "For You" panel — see home-page.tsx's git history), unchanged,
// just moved under the Today Hub's "Une recommandation personnalisée" card.
// No extra umbrella heading here: each rail's own title (because you liked
// X / love {{genre}} / watch {{director}}/{{actor}} most) already reads as
// a distinct personalized pick — stacking a second heading level above them
// would repeat, not clarify.
export function PersonalizedRecommendationSection({
  becauseYouLiked,
  favouriteGenreRail,
  peopleYouWatch,
}: PersonalizedRecommendationSectionProps) {
  const { t } = useTranslation();
  const hasContent =
    (Boolean(becauseYouLiked.seedTitle) && becauseYouLiked.items.length > 0) ||
    (Boolean(favouriteGenreRail.genre) && favouriteGenreRail.items.length > 0) ||
    (Boolean(peopleYouWatch.topDirector) && peopleYouWatch.directorItems.length > 0) ||
    (Boolean(peopleYouWatch.topActor) && peopleYouWatch.actorItems.length > 0);

  if (!hasContent) return null;

  return (
    <div className="space-y-8">
      {becauseYouLiked.seedTitle && becauseYouLiked.items.length > 0 ? (
        <div>
          <SectionHeader
            title={t("home.becauseYouLiked", { title: becauseYouLiked.seedTitle })}
            subtitle={t("home.becauseYouLikedSubtitle")}
            size="sub"
          />
          <MediaGrid items={becauseYouLiked.items} />
        </div>
      ) : null}

      {favouriteGenreRail.genre && favouriteGenreRail.items.length > 0 ? (
        <div>
          <SectionHeader
            title={t("home.becauseYouLoveGenre", { genre: t(favouriteGenreRail.genre.labelKey) })}
            subtitle={t("home.becauseYouLoveGenreSubtitle")}
            size="sub"
          />
          <MediaGrid items={favouriteGenreRail.items} />
        </div>
      ) : null}

      <PeopleYouWatchRails {...peopleYouWatch} />
    </div>
  );
}
