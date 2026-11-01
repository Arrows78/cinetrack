import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { usePeopleStats, type PersonTally } from "@/features/media/use-people-you-watch";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { PartialErrorState } from "@/components/states/partial-error-state";
import { logger } from "@/shared/lib/logger";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import fallbackPortrait from "@/assets/person-placeholder.svg";

function PeopleList({ title, people }: { title: string; people: PersonTally[] }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0">
      <h3 className="text-body-sm font-medium">{title}</h3>
      {people.length ? (
        <ol className="mt-3 space-y-2">
          {people.map((person, index) => (
            <li key={person.id}>
              <Link
                to="/people/$personId"
                params={{ personId: String(person.id) }}
                className="flex items-center gap-3 rounded-2xl p-1.5 transition hover:bg-foreground/[0.04]"
              >
                <span className="w-4 text-right text-caption text-muted-foreground">{index + 1}</span>
                <img
                  src={buildTmdbImageUrl(person.profilePath, "w185") ?? fallbackPortrait}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-10 rounded-xl object-cover"
                />
                <span className="min-w-0 flex-1 truncate font-medium">{person.name}</span>
                <span className="shrink-0 text-caption text-muted-foreground">
                  {t("stats.people.titles", { count: person.count })}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-body-sm text-muted-foreground">{t("stats.people.none")}</p>
      )}
    </div>
  );
}

/**
 * Directors and actors who come back most across the user's completed
 * titles (see usePeopleStats). Hidden until a pattern exists — a person needs
 * to recur on at least two titles to be listed.
 */
export function PeopleStatsSection() {
  const { t } = useTranslation();
  const people = usePeopleStats();

  useEffect(() => {
    if (people.isError) logger.warn("People statistics failed to load");
  }, [people.isError]);

  if (people.isError) {
    return (
      <Panel>
        <h2 className="text-heading-sm">{t("stats.people.title")}</h2>
        <PartialErrorState
          className="mt-4"
          message={t("stats.sectionUnavailable", { section: t("stats.people.title") })}
          onRetry={() => void people.refetch()}
        />
      </Panel>
    );
  }
  if (people.isLoading) {
    return <Skeleton role="status" aria-label={t("stats.people.loading")} className="h-48" />;
  }
  if (!people.directors.length && !people.actors.length) return null;

  return (
    <Panel>
      <h2 className="text-heading-sm">{t("stats.people.title")}</h2>
      <p className="mt-1 text-body-sm text-muted-foreground">
        {t("stats.people.basedOn", { count: people.titleCount })}
      </p>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <PeopleList title={t("stats.people.directors")} people={people.directors} />
        <PeopleList title={t("stats.people.actors")} people={people.actors} />
      </div>
    </Panel>
  );
}
