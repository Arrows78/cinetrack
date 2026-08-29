import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { PLATFORMS } from "@/shared/constants/discover";
import { useMergedGenres } from "@/features/media/use-merged-genres";

// Shared between the home dashboard and Search's default (no-query) browse
// state — see CLAUDE.md's rule against hand-duplicated lists/markup.
export function BrowseByGenre({ startIndex }: { startIndex: number }) {
  const { t } = useTranslation();
  const mergedGenres = useMergedGenres();

  return (
    <section>
      <SectionHeader title={t("home.browseByGenre")} subtitle={t("home.browseByGenreSubtitle")} index={startIndex} />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
        {mergedGenres.map((genre) => (
          <Panel
            asChild
            tone="card"
            key={genre.label}
            className="flex flex-col items-center gap-2 px-2 py-4 text-center transition-all duration-fast hover:border-primary/40 hover:bg-primary/10 hover:shadow-glow active:scale-[0.97]"
          >
            <Link
              to="/search"
              search={{
                q: t(genre.labelKey),
                scope: "all",
                genreMovie: genre.movieId ? String(genre.movieId) : undefined,
                genreSeries: genre.seriesId ? String(genre.seriesId) : undefined,
              }}
              className="group"
            >
              <span className="text-2xl leading-none">{genre.icon}</span>
              <span className="text-caption font-medium leading-tight text-muted-foreground transition-colors group-hover:text-primary">
                {t(genre.labelKey)}
              </span>
            </Link>
          </Panel>
        ))}
      </div>
    </section>
  );
}

export function BrowseByPlatform({ startIndex }: { startIndex: number }) {
  const { t } = useTranslation();

  return (
    <section>
      <SectionHeader
        title={t("home.browseByPlatform")}
        subtitle={t("home.browseByPlatformSubtitle")}
        index={startIndex}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {PLATFORMS.map((platform) => (
          <Panel
            asChild
            tone="card"
            key={platform.id}
            className="p-4 transition-all duration-fast hover:scale-[1.02] hover:shadow-glow active:scale-[0.98]"
          >
            <Link
              to="/search"
              search={{ q: platform.label, scope: "all", provider: String(platform.id) }}
              className="group flex items-center gap-3"
              style={{ borderColor: `${platform.color}33` }}
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
                style={{ backgroundColor: platform.color }}
              >
                {platform.initial}
              </div>
              <span className="text-sm font-medium">{platform.label}</span>
            </Link>
          </Panel>
        ))}
      </div>
    </section>
  );
}
