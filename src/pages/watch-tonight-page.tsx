import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dices } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaGrid } from "@/components/media/media-grid";
import { GENRES, PLATFORMS } from "@/shared/constants/discover";
import { watchTonightService } from "@/services/watch-tonight-service";
export function WatchTonightPage() {
  const [genre,setGenre]=useState(""); const [provider,setProvider]=useState(""); const [runtime,setRuntime]=useState("120"); const [seed,setSeed]=useState(0);
  const query=useQuery({queryKey:["watch-tonight",genre,provider,runtime,seed],queryFn:()=>watchTonightService.pick({genre:genre?Number(genre):undefined,provider:provider?Number(provider):undefined,maxRuntime:runtime?Number(runtime):undefined})});
  return <div className="space-y-6"><header><h1 className="font-display text-3xl font-bold">Que regarder ce soir ?</h1><p className="text-muted-foreground">Trois propositions issues d’abord de votre bibliothèque, puis du catalogue.</p></header><section className="grid gap-3 rounded-3xl border border-border bg-card/60 p-5 md:grid-cols-4"><select className="h-10 rounded-xl border border-border bg-background px-3" value={genre} onChange={(e)=>setGenre(e.target.value)}><option value="">Tous les genres</option>{GENRES.movies.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select><select className="h-10 rounded-xl border border-border bg-background px-3" value={provider} onChange={(e)=>setProvider(e.target.value)}><option value="">Toutes les plateformes</option>{PLATFORMS.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select><input className="h-10 rounded-xl border border-border bg-background px-3" type="number" min="30" step="15" value={runtime} onChange={(e)=>setRuntime(e.target.value)} aria-label="Durée maximale"/><Button type="button" onClick={()=>setSeed((value)=>value+1)}><Dices className="mr-2 size-4"/>Relancer</Button></section>{query.isLoading?<p>Recherche des meilleures options…</p>:<MediaGrid items={query.data ?? []}/>}</div>;
}
