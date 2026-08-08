import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Panel } from "@/components/ui/panel";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { usePeopleSearch } from "@/features/media/use-discovery";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import { staggerDelayMs } from "@/shared/utils/animation";

// Matches MediaGrid's entrance cascade (see media-grid.tsx) so cards feel
// consistent across the app, even though person cards have a different shape.
const MAX_STAGGER_DELAY_S = 0.44;

export function PeoplePage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 350);
  const people = usePeopleSearch(debounced);
  return (
    <div className="space-y-6">
      <header className="animate-in" style={{ animationDelay: `${staggerDelayMs(0)}ms` }}>
        <h1 className="font-display text-3xl font-bold">{t("people.title")}</h1>
        <p className="text-muted-foreground">{t("people.description")}</p>
      </header>
      <Panel asChild tone="card" className="flex items-center gap-2 px-4 py-0 animate-in">
        <label style={{ animationDelay: `${staggerDelayMs(1)}ms` }}>
          <Search className="size-4 text-muted-foreground" />
          <input
            className="h-12 flex-1 rounded-lg bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("people.searchPlaceholder")}
          />
        </label>
      </Panel>
      {people.isLoading ? <GridSkeleton count={8} /> : null}
      {people.isError ? <RemoteErrorState error={people.error} onRetry={() => void people.refetch()} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!people.isLoading &&
          !people.isError &&
          people.data?.results.map((person, index) => (
            <motion.div
              key={person.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 26,
                delay: Math.min(index * 0.05, MAX_STAGGER_DELAY_S),
              }}
            >
              <Panel asChild tone="card" className="block p-4 transition hover:border-primary/50">
                <Link to="/people/$personId" params={{ personId: String(person.id) }}>
                  <img
                    className="aspect-[2/3] w-full rounded-2xl object-cover"
                    src={
                      buildTmdbImageUrl(person.profilePath, "w500") ??
                      "https://placehold.co/500x750/111827/374151?text=Portrait"
                    }
                    alt={person.name}
                  />
                  <h2 className="mt-3 font-semibold">{person.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {person.knownForDepartment ?? t("people.fallbackDepartment")}
                  </p>
                </Link>
              </Panel>
            </motion.div>
          ))}
      </div>
    </div>
  );
}
