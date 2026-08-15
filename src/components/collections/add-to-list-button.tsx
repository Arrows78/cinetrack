import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ListPlus } from "lucide-react";
import type { MediaSummary } from "@/types/media";
import { useAddToCustomList, useCustomLists } from "@/features/collections/use-collections";
import { Button } from "@/components/ui/button";

export function AddToListButton({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const lists = useCustomLists();
  const add = useAddToCustomList();
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!lists.data?.length) return null;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2">
        <select
          aria-label={t("collections.customList")}
          className="h-10 max-w-52 rounded-xl border border-border bg-background px-3 text-sm"
          value={selected}
          onChange={(event) => {
            setError(null);
            setSelected(event.target.value);
          }}
        >
          <option value="">{t("collections.addToAList")}</option>
          {lists.data.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="icon"
          variant="outline"
          disabled={!selected || add.isSaving}
          title={t("collections.addToList")}
          aria-label={t("collections.addToList")}
          onClick={() => {
            setError(null);
            void add
              .add({ listId: selected, media })
              .then(() => setSelected(""))
              .catch(() => setError(t("desktop.operationFailed")));
          }}
        >
          <ListPlus className="size-4" />
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
