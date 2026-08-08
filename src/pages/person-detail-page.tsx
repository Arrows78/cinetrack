import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";
import { MediaGrid } from "@/components/media/media-grid";
import { Panel } from "@/components/ui/panel";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { usePerson } from "@/features/media/use-discovery";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import { staggerDelayMs } from "@/shared/utils/animation";
export function PersonDetailPage() {
  const { t } = useTranslation();
  const { personId } = useParams({ from: "/people/$personId" });
  const query = usePerson(Number(personId));
  if (query.isError) return <RemoteErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <p className="text-muted-foreground">{t("person.loading")}</p>;
  return (
    <div className="space-y-8">
      <Panel className="flex items-end gap-5 animate-in" style={{ animationDelay: `${staggerDelayMs(0)}ms` }}>
        <img
          className="h-48 w-32 rounded-2xl object-cover"
          src={
            buildTmdbImageUrl(query.data.profilePath, "w500") ??
            "https://placehold.co/500x750/111827/374151?text=Portrait"
          }
          alt={query.data.name}
        />
        <div>
          <p className="text-sm text-primary">{query.data.knownForDepartment}</p>
          <h1 className="font-display text-4xl font-bold">{query.data.name}</h1>
        </div>
      </Panel>
      <section>
        <h2 className="mb-4 font-display text-2xl font-bold">{t("person.knownFilmography")}</h2>
        <MediaGrid items={query.data.knownFor} />
      </section>
    </div>
  );
}
