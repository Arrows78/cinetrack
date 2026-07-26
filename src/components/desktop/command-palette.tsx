import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Command, Search } from "lucide-react";
import { router } from "@/app/router-config";

export function CommandPalette() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const commands = useMemo(() => [
    [t("commandPalette.commands.home"), "/"],
    [t("commandPalette.commands.movies"), "/movies"],
    [t("commandPalette.commands.series"), "/series"],
    [t("commandPalette.commands.search"), "/search"],
    [t("commandPalette.commands.watchTonight"), "/watch-tonight"],
    [t("commandPalette.commands.calendar"), "/calendar"],
    [t("commandPalette.commands.collections"), "/collections"],
    [t("commandPalette.commands.stats"), "/stats"],
    [t("commandPalette.commands.people"), "/people"],
    [t("commandPalette.commands.settings"), "/settings"],
  ] as const, [t]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen((value) => !value); } if (event.key === "Escape") setOpen(false); };
    const external = () => setOpen(true);
    window.addEventListener("keydown", keyboard); window.addEventListener("cinetrack:command-palette", external);
    return () => { window.removeEventListener("keydown", keyboard); window.removeEventListener("cinetrack:command-palette", external); };
  }, []);
  const filtered = useMemo(() => commands.filter(([label]) => label.toLowerCase().includes(query.toLowerCase())), [query, commands]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] grid place-items-start bg-black/55 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
    <div className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-3 border-b border-border px-4"><Search className="size-4 text-muted-foreground" /><input autoFocus className="h-14 flex-1 bg-transparent outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("commandPalette.searchPlaceholder")} /><kbd className="rounded border px-2 py-1 text-xs text-muted-foreground">Esc</kbd></div>
      <div className="max-h-96 overflow-y-auto p-2">{filtered.map(([label,to]) => <button key={to} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-muted" onClick={() => { setOpen(false); void router.navigate({ to }); }}><Command className="size-4 text-primary" />{label}</button>)}</div>
    </div>
  </div>;
}
