import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { ImdbLink } from "@/components/media/detail/imdb-link";
import { EmptyState } from "@/components/states/empty-state";
import { HeroSkeleton } from "@/components/states/loading-skeletons";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { MediaGrid } from "@/components/media/primitives/media-grid";
import { usePerson } from "@/features/media/use-discovery";
import { ageFromBirthday, buildTmdbImageUrl, formatDate } from "@/shared/utils/format";
import { staggerDelayMs } from "@/shared/utils/animation";
import type { PersonCreditItem } from "@/types/media";
import fallbackPoster from "@/assets/poster-placeholder.svg";
import fallbackPortrait from "@/assets/person-placeholder.svg";

// Two separate <Link> branches (rather than one with a conditional `to`) so
// each Link's `to`/`params` pair stays a matched literal — same pattern
// ViewDetailsButton (watch-tonight-page.tsx) and MediaCard use for their own
// movie/series routing.
function FilmographyCard({ item }: { item: PersonCreditItem }) {
  const { t } = useTranslation();
  const inner = (
    <>
      <img
        src={buildTmdbImageUrl(item.posterPath, "w185") ?? fallbackPoster}
        alt=""
        className="h-24 w-16 shrink-0 rounded-xl object-cover"
      />
      <div className="min-w-0">
        <p className="truncate font-medium">{item.title}</p>
        <p className="truncate text-sm text-muted-foreground">{item.role || t("person.uncredited")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.year ?? t("common.unknownDate")}
          {item.episodeCount ? ` · ${t("person.episodeCount", { count: item.episodeCount })}` : ""}
        </p>
      </div>
    </>
  );
  return (
    <Card className="rounded-3xl p-3 transition hover:border-primary/50">
      {item.mediaType === "movie" ? (
        <Link to="/movies/$movieId" params={{ movieId: String(item.id) }} className="flex items-start gap-3">
          {inner}
        </Link>
      ) : (
        <Link to="/series/$seriesId" params={{ seriesId: String(item.id) }} className="flex items-start gap-3">
          {inner}
        </Link>
      )}
    </Card>
  );
}

export function PersonDetailPage() {
  const { t } = useTranslation();
  const { personId } = useParams({ from: "/people/$personId" });
  const id = Number(personId);
  const query = usePerson(id);

  // Same guard as movie/series detail pages: a non-numeric id and
  // isPending-vs-isLoading both used to fall through to a bare `return
  // null` — a permanently blank page instead of a skeleton or an error.
  if (!Number.isFinite(id)) {
    return <EmptyState icon={TriangleAlert} title={t("pages.notFound")} description={t("pages.notFoundDesc")} />;
  }
  if (query.isPending) return <HeroSkeleton />;
  if (query.isError) {
    return <RemoteErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const person = query.data;
  const age = ageFromBirthday(person.birthday, person.deathday);

  return (
    <div className="space-y-8">
      <Panel
        className="flex flex-col gap-5 animate-in sm:flex-row sm:items-start"
        style={{ animationDelay: `${staggerDelayMs(0)}ms` }}
      >
        <img
          className="h-48 w-32 shrink-0 rounded-2xl object-cover"
          src={buildTmdbImageUrl(person.profilePath, "w500") ?? fallbackPortrait}
          alt=""
        />
        <div className="min-w-0 space-y-3">
          <div>
            {person.knownForDepartment ? <p className="text-sm text-primary">{person.knownForDepartment}</p> : null}
            <h1 className="font-display text-page-title">{person.name}</h1>
            {person.alsoKnownAs.length > 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("person.alsoKnownAs")} {person.alsoKnownAs.join(", ")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {person.birthday ? (
              <Badge variant="outline">
                {person.deathday
                  ? t("person.bornAndDied", { born: formatDate(person.birthday), died: formatDate(person.deathday) })
                  : t("person.born", { date: formatDate(person.birthday) })}
                {age !== null ? ` (${t("person.ageYears", { count: age })})` : ""}
              </Badge>
            ) : null}
            {person.placeOfBirth ? (
              <Badge variant="outline">{t("person.placeOfBirth", { place: person.placeOfBirth })}</Badge>
            ) : null}
          </div>
          <p className="max-w-3xl whitespace-pre-line text-body-lg text-muted-foreground">
            {person.biography || t("person.noBiography")}
          </p>
          <ImdbLink imdbId={person.imdbId} />
        </div>
      </Panel>

      {person.knownFor.length > 0 ? (
        <section>
          <SectionHeader title={t("person.knownFilmography")} index={1} />
          <MediaGrid items={person.knownFor} />
        </section>
      ) : null}

      {person.filmography.length > 0 ? (
        <section>
          <SectionHeader title={t("person.fullFilmography")} index={2} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {person.filmography.map((item, index) => (
              <FilmographyCard key={`${item.department}-${item.mediaType}-${item.id}-${index}`} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
