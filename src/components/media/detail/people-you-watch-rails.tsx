import { useTranslation } from "react-i18next";
import { MediaGrid } from "@/components/media/primitives/media-grid";
import { SectionHeader } from "@/components/media/primitives/section-header";
import type { PersonTally } from "@/features/media/use-people-you-watch";
import type { MediaSummary } from "@/types/media";

export interface PeopleYouWatchRailsProps {
  topDirector: PersonTally | null;
  directorItems: MediaSummary[];
  topActor: PersonTally | null;
  actorItems: MediaSummary[];
}

// Purely presentational (the aggregation/fetching lives in
// usePeopleYouWatch) so the home page can call that hook once, fold its
// "is there anything to show" result into hasForYouContent, and pass the
// already-computed data straight in here — matching how becauseYouLiked/
// favouriteGenreRail are wired into the same "For You" panel.
export function PeopleYouWatchRails({ topDirector, directorItems, topActor, actorItems }: PeopleYouWatchRailsProps) {
  const { t } = useTranslation();

  return (
    <>
      {topDirector && directorItems.length > 0 ? (
        <div>
          <SectionHeader
            title={t("home.becauseYouWatchDirector", { name: topDirector.name })}
            subtitle={t("home.becauseYouWatchDirectorSubtitle")}
            size="sub"
          />
          <MediaGrid items={directorItems} />
        </div>
      ) : null}

      {topActor && actorItems.length > 0 ? (
        <div>
          <SectionHeader
            title={t("home.becauseYouWatchActor", { name: topActor.name })}
            subtitle={t("home.becauseYouWatchActorSubtitle")}
            size="sub"
          />
          <MediaGrid items={actorItems} />
        </div>
      ) : null}
    </>
  );
}
