import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { Bell, BellOff, Bookmark, BookmarkCheck, Eye, EyeOff, Film, Moon, Search, Sun, Tv } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigationItems } from "@/shared/constants/navigation";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useSearch } from "@/features/media/use-search";
import { useMovieSeen } from "@/features/progress/use-progress";
import { useAvailabilityAlert } from "@/features/availability/use-availability-alerts";
import { useAddToLibraryToggle } from "@/features/library/use-add-to-library-toggle";
import { notificationService } from "@/features/desktop/notification-service";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { queryKeys } from "@/shared/constants/query-keys";
import { DEBOUNCE_MS } from "@/shared/constants/query";
import { DEFAULT_TMDB_REGION } from "@/shared/constants/discover";
import { cn } from "@/shared/lib/cn";
import type { MediaSummary, Movie, Series } from "@/types/media";

interface PaletteItem {
  key: string;
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  section: "contextual" | "command" | "title";
  run: () => void;
}

type CurrentDetailMedia =
  { mediaType: "movie"; id: number; media: Movie } | { mediaType: "series"; id: number; media: Series };

const MOVIE_DETAIL_PATH = /^\/movies\/(\d+)$/;
const SERIES_DETAIL_PATH = /^\/series\/(\d+)$/;

// The palette is mounted once, globally — it has no natural access to
// "which title is this page showing". Rather than refetch it (the detail
// page already did, seconds ago), this reads straight out of the same
// react-query cache that page populated, keyed exactly like
// useMovieDetails/useSeriesDetails already do. Returns null off a detail
// page, or if that page's own fetch hasn't resolved yet.
function useCurrentDetailMedia(): CurrentDetailMedia | null {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();

  const movieMatch = MOVIE_DETAIL_PATH.exec(pathname);
  if (movieMatch) {
    const id = Number(movieMatch[1]);
    const media = queryClient.getQueryData<Movie>(queryKeys.remote.movieDetails(id));
    return media ? { mediaType: "movie", id, media } : null;
  }

  const seriesMatch = SERIES_DETAIL_PATH.exec(pathname);
  if (seriesMatch) {
    const id = Number(seriesMatch[1]);
    const media = queryClient.getQueryData<Series>(queryKeys.remote.seriesDetails(id));
    return media ? { mediaType: "series", id, media } : null;
  }

  return null;
}

const EMPTY_PLACEHOLDER_MEDIA: MediaSummary = {
  id: Number.NaN,
  mediaType: "movie",
  title: "",
  overview: "",
  genres: [],
  cast: [],
};

const TITLE_RESULTS_CAP = 5;
const TITLE_SEARCH_MIN_LENGTH = 2;

export function CommandPalette() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigationItems = useNavigationItems();
  const preferences = usePreferences();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Only actually searches once the palette is open and the query has real
  // content — an empty/short query short-circuits inside useSearch itself
  // (its own `enabled` gate), so this never fires a network request while
  // the palette is closed or the box is still empty.
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);
  const titleSearch = useSearch(open ? debouncedQuery : "", "all");

  const navigate = useCallback(
    (to: string) => {
      setOpen(false);
      // Cast mirrors desktop-service.ts's own navigate() helper — the palette
      // (and title search results) build paths as plain strings rather than
      // picking from TanStack Router's literal route union.
      void router.navigate({ to: to as never });
    },
    [router]
  );

  const theme = preferences.data?.theme ?? "dark";
  const nextTheme = theme === "dark" ? "light" : "dark";
  const updatePreference = preferences.updatePreference;

  // Contextual actions — only meaningful on a movie/series detail page, so
  // both hooks below stay disabled (no IPC call at all) everywhere else:
  // useMovieSeen's own `enabled` gate gets NaN off a movie page, and
  // useAvailabilityAlert takes an explicit `enabled` for the same reason.
  const currentDetail = useCurrentDetailMedia();
  const region = preferences.data?.region ?? DEFAULT_TMDB_REGION;
  const providerIds = preferences.data?.preferredProviderIds ?? [];
  const alertMedia = currentDetail?.media ?? EMPTY_PLACEHOLDER_MEDIA;
  const alertQuery = useAvailabilityAlert(alertMedia, region, providerIds, { enabled: Boolean(currentDetail) });
  const movieSeenQuery = useMovieSeen(currentDetail?.mediaType === "movie" ? currentDetail.id : Number.NaN);
  const libraryToggle = useAddToLibraryToggle(alertMedia, { enabled: Boolean(currentDetail) });

  const contextualItems = useMemo<PaletteItem[]>(() => {
    if (!currentDetail) return [];
    const items: PaletteItem[] = [];

    items.push({
      key: "context-toggle-library",
      label: t(libraryToggle.isInLibrary ? "commandPalette.removeFromLibrary" : "media.addToLibrary"),
      icon: libraryToggle.isInLibrary ? BookmarkCheck : Bookmark,
      section: "contextual",
      run: () => {
        setOpen(false);
        void libraryToggle.toggle();
      },
    });

    if (currentDetail.mediaType === "movie") {
      const seen = Boolean(movieSeenQuery.data);
      const movie = currentDetail.media;
      items.push({
        key: "context-toggle-seen",
        label: t(seen ? "media.markUnseen" : "media.markSeen"),
        icon: seen ? EyeOff : Eye,
        section: "contextual",
        run: () => {
          setOpen(false);
          void movieSeenQuery.toggleMovieSeen({ movie, watched: !seen });
        },
      });
    }

    const hasAlert = Boolean(alertQuery.data);
    items.push({
      key: "context-toggle-alert",
      label: t(hasAlert ? "media.disableAlert" : "media.availabilityAlert"),
      icon: hasAlert ? BellOff : Bell,
      section: "contextual",
      run: () => {
        setOpen(false);
        void (async () => {
          if (!hasAlert && !(await notificationService.requestPermission())) return;
          await alertQuery.toggle();
        })();
      },
    });

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- movieSeenQuery/alertQuery/libraryToggle carry their own reactive .data already listed
  }, [currentDetail, movieSeenQuery.data, alertQuery.data, libraryToggle.isInLibrary, t]);

  const commands = useMemo<PaletteItem[]>(() => {
    const pages: PaletteItem[] = navigationItems.map((item) => ({
      key: `page-${item.to}`,
      label: item.label,
      icon: item.icon,
      section: "command",
      run: () => navigate(item.to),
    }));
    const actions: PaletteItem[] = [
      {
        key: "action-theme",
        label: t(nextTheme === "light" ? "commandPalette.switchToLight" : "commandPalette.switchToDark"),
        icon: nextTheme === "light" ? Sun : Moon,
        section: "command",
        run: () => {
          setOpen(false);
          void updatePreference({ key: "theme", value: nextTheme });
        },
      },
    ];
    return [...actions, ...contextualItems, ...pages];
  }, [navigationItems, nextTheme, t, updatePreference, contextualItems, navigate]);

  const filteredCommands = useMemo(
    () => commands.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
    [commands, query]
  );

  const titleResults = useMemo<PaletteItem[]>(() => {
    if (debouncedQuery.trim().length < TITLE_SEARCH_MIN_LENGTH) return [];
    return titleSearch.items.slice(0, TITLE_RESULTS_CAP).map((media) => ({
      key: `title-${media.mediaType}-${media.id}`,
      label: media.title,
      sublabel: media.year ? String(media.year) : undefined,
      icon: media.mediaType === "movie" ? Film : Tv,
      section: "title",
      run: () => navigate(media.mediaType === "movie" ? `/movies/${media.id}` : `/series/${media.id}`),
    }));
  }, [titleSearch.items, debouncedQuery, navigate]);

  const results = useMemo(() => [...filteredCommands, ...titleResults], [filteredCommands, titleResults]);
  const isSearchingTitles =
    debouncedQuery.trim().length >= TITLE_SEARCH_MIN_LENGTH && query === debouncedQuery && titleSearch.isLoading;

  // Reset the selection to the top result whenever the query changes or the
  // palette re-opens. Adjusted during render (React's documented pattern for
  // this) rather than in a useEffect, which would call setState after an
  // extra commit and trigger a cascading re-render for no benefit here.
  const [resetKey, setResetKey] = useState({ query, open });
  if (resetKey.query !== query || resetKey.open !== open) {
    setResetKey({ query, open });
    setSelectedIndex(0);
  }

  // Keyboard handling reads from this ref rather than closing over
  // `results`/`selectedIndex`/`open` directly, so the global listener only
  // needs to be attached once (see load-more-button.tsx for the same
  // pattern) instead of re-subscribing on every keystroke.
  const stateRef = useRef({ open, results, selectedIndex });
  useEffect(() => {
    stateRef.current = { open, results, selectedIndex };
  }, [open, results, selectedIndex]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (!stateRef.current.open) return;
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, stateRef.current.results.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        const item = stateRef.current.results[stateRef.current.selectedIndex];
        if (item) item.run();
      }
    };
    const external = () => setOpen(true);
    window.addEventListener("keydown", keyboard);
    window.addEventListener("cinetrack:command-palette", external);
    return () => {
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("cinetrack:command-palette", external);
    };
  }, []);

  const contextualResults = results.filter((item) => item.section === "contextual");
  const commandResults = results.filter((item) => item.section === "command");
  const titleResultsOnly = results.filter((item) => item.section === "title");
  const registerItemRef = (index: number, node: HTMLButtonElement | null) => {
    itemRefs.current[index] = node;
  };

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-command-palette grid place-items-start bg-black/55 p-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="relative flex items-center border-b border-border">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("commandPalette.searchPlaceholder")}
                aria-label={t("commandPalette.searchPlaceholder")}
                className="h-14 rounded-none border-none bg-transparent pl-11 pr-16 ring-offset-0 focus-visible:ring-0"
              />
              <kbd className="absolute right-4 top-1/2 -translate-y-1/2 rounded border px-2 py-1 text-xs text-muted-foreground">
                Esc
              </kbd>
            </div>
            <div className="max-h-96 overflow-y-auto p-2 pb-3">
              {contextualResults.length ? (
                <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("commandPalette.onThisPage")}
                </p>
              ) : null}
              {contextualResults.map((item) => {
                const index = results.indexOf(item);
                return (
                  <PaletteRow
                    key={item.key}
                    item={item}
                    index={index}
                    selectedIndex={selectedIndex}
                    onRegisterRef={registerItemRef}
                    onHover={setSelectedIndex}
                  />
                );
              })}

              {commandResults.map((item) => {
                const index = results.indexOf(item);
                return (
                  <PaletteRow
                    key={item.key}
                    item={item}
                    index={index}
                    selectedIndex={selectedIndex}
                    onRegisterRef={registerItemRef}
                    onHover={setSelectedIndex}
                  />
                );
              })}

              {titleResultsOnly.length || isSearchingTitles ? (
                <p className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {isSearchingTitles ? t("commandPalette.searchingTitles") : t("commandPalette.titles")}
                </p>
              ) : null}
              {titleResultsOnly.map((item) => {
                const index = results.indexOf(item);
                return (
                  <PaletteRow
                    key={item.key}
                    item={item}
                    index={index}
                    selectedIndex={selectedIndex}
                    onRegisterRef={registerItemRef}
                    onHover={setSelectedIndex}
                  />
                );
              })}

              {!results.length && !isSearchingTitles ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("pages.noResults")}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {/* Rendered even while the palette itself is closed: clicking the
          contextual library action closes the palette immediately, and if
          that click turns out to be blocked (real progress on the title),
          this is what surfaces the confirmation to finish the removal. */}
      <ConfirmDialog
        open={libraryToggle.confirmingForceRemove}
        onOpenChange={libraryToggle.setConfirmingForceRemove}
        title={t("library.removeConfirmTitle")}
        description={t("library.removeConfirmDescription")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={libraryToggle.confirmForceRemove}
      />
    </>
  );
}

function PaletteRow({
  item,
  index,
  selectedIndex,
  onRegisterRef,
  onHover,
}: {
  item: PaletteItem;
  index: number;
  selectedIndex: number;
  onRegisterRef: (index: number, node: HTMLButtonElement | null) => void;
  onHover: (index: number) => void;
}) {
  const Icon = item.icon;
  const isSelected = index === selectedIndex;
  return (
    <button
      ref={(node) => onRegisterRef(index, node)}
      type="button"
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
        isSelected ? "bg-muted" : "hover:bg-muted/60"
      )}
      aria-selected={isSelected}
      onMouseEnter={() => onHover(index)}
      onClick={item.run}
    >
      <Icon className="size-4 text-primary" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.sublabel ? (
        <>
          {" "}
          <span className="shrink-0 text-xs text-muted-foreground">{item.sublabel}</span>
        </>
      ) : null}
    </button>
  );
}
