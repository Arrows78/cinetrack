import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ListPlus } from "lucide-react";
import type { MediaSummary } from "@/types/media";
import { useAddToCustomList, useCustomLists } from "@/features/custom-lists/use-custom-lists";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { IconTooltip } from "@/components/ui/tooltip";

export function AddToListButton({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const lists = useCustomLists();
  const add = useAddToCustomList();
  const [selected, setSelected] = useState("");

  if (!lists.data?.length) {
    return (
      <p className="text-body-sm text-muted-foreground">
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
      <IconTooltip label={t("library.lists.addToList")}>
        <Button
          type="button"
          size="icon"
          variant="outline"
          disabled={!selected || add.isSaving}
          aria-label={t("library.lists.addToList")}
          onClick={() => {
            // Failure toast is handled by the app-wide MutationCache error
            // handler (see query-client.ts).
            void add
              .add({ listId: selected, media })
              .then(() => setSelected(""))
              .catch(() => {});
          }}
        >
          <ListPlus className="size-4" />
        </Button>
      </IconTooltip>
    </div>
  );
}
