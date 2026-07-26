import { useEffect, useState } from "react";
import { Heart, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLibraryItem } from "@/hooks/use-library";
import type { LibraryStatus, MediaSummary } from "@/types/media";

const statuses: Array<{ value: LibraryStatus; label: string }> = [
  { value: "planned", label: "À voir" },
  { value: "watching", label: "En cours" },
  { value: "paused", label: "En pause" },
  { value: "completed", label: "Terminé" },
  { value: "dropped", label: "Abandonné" },
  { value: "rewatching", label: "Revisionnage" },
];

export function LibraryEditor({ media }: { media: MediaSummary }) {
  const library = useLibraryItem(media);
  const [status, setStatus] = useState<LibraryStatus>("planned");
  const [favourite, setFavourite] = useState(false);
  const [userRating, setUserRating] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [rewatchCount, setRewatchCount] = useState(0);

  useEffect(() => {
    if (!library.data) return;
    setStatus(library.data.status);
    setFavourite(library.data.favourite);
    setUserRating(library.data.userRating?.toString() ?? "");
    setNotes(library.data.notes ?? "");
    setTags(library.data.tags.join(", "));
    setRewatchCount(library.data.rewatchCount);
  }, [library.data]);

  const save = () =>
    library.save({
      status,
      favourite,
      userRating: userRating ? Math.min(10, Math.max(0, Number(userRating))) : null,
      notes: notes.trim() || null,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      rewatchCount: Math.max(0, rewatchCount),
    });

  return (
    <section className="rounded-3xl border border-border bg-card/60 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Ma bibliothèque</p>
          <p className="text-sm text-muted-foreground">Statut, note, tags, avis privé et revisionnages.</p>
        </div>
        <Button
          type="button"
          variant={favourite ? "default" : "outline"}
          size="icon"
          aria-label="Favori"
          onClick={() => setFavourite((value) => !value)}
        >
          <Heart className={favourite ? "size-4 fill-current" : "size-4"} />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Statut</span>
          <select className="h-10 rounded-xl border border-border bg-background px-3" value={status} onChange={(event) => setStatus(event.target.value as LibraryStatus)}>
            {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Ma note / 10</span>
          <input className="h-10 rounded-xl border border-border bg-background px-3" type="number" min="0" max="10" step="0.5" value={userRating} onChange={(event) => setUserRating(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Revisionnages</span>
          <input className="h-10 rounded-xl border border-border bg-background px-3" type="number" min="0" value={rewatchCount} onChange={(event) => setRewatchCount(Number(event.target.value))} />
        </label>
      </div>

      <label className="mt-4 grid gap-1 text-sm">
        <span className="text-muted-foreground">Tags, séparés par des virgules</span>
        <input className="h-10 rounded-xl border border-border bg-background px-3" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="famille, sf, dimanche" />
      </label>
      <label className="mt-4 grid gap-1 text-sm">
        <span className="text-muted-foreground">Notes privées</span>
        <textarea className="min-h-24 rounded-xl border border-border bg-background p-3" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void save()} disabled={library.isSaving}>
          <Save className="mr-2 size-4" /> Enregistrer
        </Button>
        {library.data ? (
          <Button type="button" variant="ghost" onClick={() => void library.remove()} disabled={library.isSaving}>
            <Trash2 className="mr-2 size-4" /> Retirer
          </Button>
        ) : null}
      </div>
    </section>
  );
}
