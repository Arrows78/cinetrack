import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { router } from "@/app/router-config";
import { useNavigationItems } from "@/shared/constants/navigation";
import { cn } from "@/shared/lib/cn";

export function CommandPalette() {
  const { t } = useTranslation();
  const navigationItems = useNavigationItems();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const filtered = useMemo(
    () => navigationItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
    [query, navigationItems]
  );

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
  // `filtered`/`selectedIndex`/`open` directly, so the global listener only
  // needs to be attached once (see load-more-button.tsx for the same
  // pattern) instead of re-subscribing on every keystroke.
  const stateRef = useRef({ open, filtered, selectedIndex });
  useEffect(() => {
    stateRef.current = { open, filtered, selectedIndex };
  }, [open, filtered, selectedIndex]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const navigate = (to: string) => {
    setOpen(false);
    void router.navigate({ to });
  };

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
        setSelectedIndex((index) => Math.min(index + 1, stateRef.current.filtered.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        const item = stateRef.current.filtered[stateRef.current.selectedIndex];
        if (item) navigate(item.to);
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
          {filtered.map((item, index) => {
            const Icon = item.icon;
            const isSelected = index === selectedIndex;
            return (
              <button
                key={item.to}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                  isSelected ? "bg-muted" : "hover:bg-muted/60"
                )}
                aria-selected={isSelected}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => navigate(item.to)}
              >
                <Icon className="size-4 text-primary" />
                {item.label}
              </button>
            );
          })}
          {!filtered.length ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("pages.noResults")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
