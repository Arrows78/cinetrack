import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ListPlus } from "lucide-react";
import type { MediaSummary } from "@/types/media";
import { useAddToCustomList, useCustomLists } from "@/features/custom-lists/use-custom-lists";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";

export function AddToListButton({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const lists = useCustomLists();
  const add = useAddToCustomList();
  const [selected, setSelected] = useState("");

  if (!lists.data?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("library.lists.noneYetPrefix")}{" "}
        <Link to="/library" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("library.lists.noneYetLink")}
        </Link>
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label={t("library.lists.customList")}
        className="max-w-52"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">{t("library.lists.addToAList")}</option>
        {lists.data.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name}
          </option>
        ))}
      </Select>
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
  );
}
