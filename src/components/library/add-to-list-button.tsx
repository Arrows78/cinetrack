import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ListPlus } from "lucide-react";
import type { MediaSummary } from "@/types/media";
import { useAddToCustomList, useCustomLists } from "@/features/library/use-custom-lists";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

export function AddToListButton({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const lists = useCustomLists();
  const add = useAddToCustomList();
  const [selected, setSelected] = useState("");

  if (!lists.data?.length) return null;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2">
        <select
          aria-label={t("library.lists.customList")}
          className="h-10 max-w-52 rounded-xl border border-border bg-background px-3 text-sm"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">{t("library.lists.addToAList")}</option>
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
          title={t("library.lists.addToList")}
          aria-label={t("library.lists.addToList")}
          onClick={() => {
            void add
              .add({ listId: selected, media })
              .then(() => setSelected(""))
              .catch(() => toast({ description: t("desktop.operationFailed"), variant: "error" }));
          }}
        >
          <ListPlus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
