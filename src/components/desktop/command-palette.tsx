import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Film, Moon, Search, Sun, Tv } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { router } from "@/app/router-config";
import { useNavigationItems } from "@/shared/constants/navigation";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useSearch } from "@/features/media/use-search";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/shared/lib/cn";

interface PaletteItem {
  key: string;
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  section: "command" | "title";
  run: () => void;
}

const TITLE_RESULTS_CAP = 5;
const TITLE_SEARCH_MIN_LENGTH = 2;

export function CommandPalette() {
  const { t } = useTranslation();
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
  const debouncedQuery = useDebouncedValue(query, 250);
  const titleSearch = useSearch(open ? debouncedQuery : "", "all");

  const navigate = (to: string) => {
    setOpen(false);
    // Cast mirrors desktop-service.ts's own navigate() helper — the palette
    // (and title search results) build paths as plain strings rather than
    // picking from TanStack Router's literal route union.
    void router.navigate({ to: to as never });
  };

  const theme = preferences.data?.theme ?? "dark";
  const nextTheme = theme === "dark" ? "light" : "dark";
  const updatePreference = preferences.updatePreference;

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
    return [...actions, ...pages];
  }, [navigationItems, nextTheme, t, updatePreference]);

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
  }, [titleSearch.items, debouncedQuery]);

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

  if (!open) return null;

  const commandResults = results.filter((item) => item.section === "command");
  const titleResultsOnly = results.filter((item) => item.section === "title");
  const registerItemRef = (index: number, node: HTMLButtonElement | null) => {
    itemRefs.current[index] = node;
  };

  return (
    <div
      className="fixed inset-0 z-command-palette grid place-items-start bg-black/55 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            className="h-14 flex-1 rounded-lg bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("commandPalette.searchPlaceholder")}
          />
          <kbd className="rounded border px-2 py-1 text-xs text-muted-foreground">Esc</kbd>
        </div>
        <div className="max-h-96 overflow-y-auto p-2 pb-3">
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
