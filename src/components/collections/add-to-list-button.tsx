import { useState } from "react";
import { ListPlus } from "lucide-react";
import type { MediaSummary } from "@/types/media";
import { useAddToCustomList, useCustomLists } from "@/hooks/use-collections";
import { Button } from "@/components/ui/button";

export function AddToListButton({ media }: { media: MediaSummary }) {
  const lists = useCustomLists();
  const add = useAddToCustomList();
  const [selected, setSelected] = useState("");

  if (!lists.data?.length) return null;

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Liste personnalisée"
        className="h-10 max-w-52 rounded-xl border border-border bg-background px-3 text-sm"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">Ajouter à une liste…</option>
        {lists.data.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
      </select>
      <Button
        type="button"
        size="icon"
        variant="outline"
        disabled={!selected || add.isSaving}
        title="Ajouter à la liste"
        onClick={() => void add.add({ listId: selected, media }).then(() => setSelected(""))}
      >
        <ListPlus className="size-4" />
      </Button>
    </div>
  );
}
