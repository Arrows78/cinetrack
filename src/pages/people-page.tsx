import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePeopleSearch } from "@/features/media/use-discovery";
import { buildTmdbImageUrl } from "@/shared/utils/format";
export function PeoplePage() {
  const { t } = useTranslation();
  const [query,setQuery]=useState(""); const debounced=useDebouncedValue(query,350); const people=usePeopleSearch(debounced);
  return <div className="space-y-6"><header><h1 className="font-display text-3xl font-bold">{t("people.title")}</h1><p className="text-muted-foreground">{t("people.description")}</p></header><label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4"><Search className="size-4 text-muted-foreground"/><input className="h-12 flex-1 bg-transparent outline-none" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={t("people.searchPlaceholder")}/></label><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{people.data?.results.map((person)=><Link key={person.id} to="/people/$personId" params={{personId:String(person.id)}} className="rounded-3xl border border-border bg-card/60 p-4 transition hover:border-primary/50"><img className="aspect-[2/3] w-full rounded-2xl object-cover" src={buildTmdbImageUrl(person.profilePath,"w500") ?? "https://placehold.co/500x750/111827/374151?text=Portrait"} alt={person.name}/><h2 className="mt-3 font-semibold">{person.name}</h2><p className="text-sm text-muted-foreground">{person.knownForDepartment ?? t("people.fallbackDepartment")}</p></Link>)}</div></div>;
}
