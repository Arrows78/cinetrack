import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Heart, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLibraryItem } from "@/features/library/use-library";
import type { LibraryStatus, MediaSummary } from "@/types/media";

export function LibraryEditor({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const library = useLibraryItem(media);
  const [status, setStatus] = useState<LibraryStatus>("planned");
  const [favourite, setFavourite] = useState(false);
  const [userRating, setUserRating] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [rewatchCount, setRewatchCount] = useState(0);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [loadedLibraryData, setLoadedLibraryData] = useState(library.data);

  if (library.data && library.data !== loadedLibraryData) {
    setLoadedLibraryData(library.data);
    setStatus(library.data.status);
    setFavourite(library.data.favourite);
    setUserRating(library.data.userRating?.toString() ?? "");
    setNotes(library.data.notes ?? "");
    setTags(library.data.tags.join(", "));
    setRewatchCount(library.data.rewatchCount);
  }

  const save = () =>
    library.save({
      status,
      favourite,
      userRating: userRating ? Math.min(10, Math.max(0, Number(userRating))) : null,
      notes: notes.trim() || null,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      rewatchCount: Math.max(0, rewatchCount),
    });

  const statuses: Array<{ value: LibraryStatus; label: string }> = [
    { value: "planned", label: t("library.statuses.planned") },
    { value: "watching", label: t("library.statuses.watching") },
    { value: "paused", label: t("library.statuses.paused") },
    { value: "completed", label: t("library.statuses.completed") },
    { value: "dropped", label: t("library.statuses.dropped") },
    { value: "rewatching", label: t("library.statuses.rewatching") },
  ];

  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{t("library.myLibrary")}</p>
          <p className="text-sm text-muted-foreground">{t("library.description")}</p>
        </div>
        <Button
          type="button"
          variant={favourite ? "default" : "outline"}
          size="icon"
          aria-label={t("library.favourite")}
          onClick={() => setFavourite((value) => !value)}
        >
          <Heart className={favourite ? "size-4 fill-current" : "size-4"} />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">{t("library.status")}</span>
          <Select value={status} onChange={(event) => setStatus(event.target.value as LibraryStatus)}>
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">{t("library.myRating")}</span>
          <Input
            size="sm"
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={userRating}
            onChange={(event) => setUserRating(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">{t("library.rewatches")}</span>
          <Input
            size="sm"
            type="number"
            min="0"
            value={rewatchCount}
            onChange={(event) => setRewatchCount(Number(event.target.value))}
          />
        </label>
      </div>

      <label className="mt-4 grid gap-1 text-sm">
        <span className="text-muted-foreground">{t("library.tagsHelp")}</span>
        <Input
          size="sm"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder={t("library.tagsPlaceholder")}
        />
      </label>
      <label className="mt-4 grid gap-1 text-sm">
        <span className="text-muted-foreground">{t("library.privateNotes")}</span>
        <Textarea className="min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void save()} disabled={library.isSaving}>
          <Save className="mr-2 size-4" /> {t("library.save")}
        </Button>
        {library.data ? (
          <Button type="button" variant="ghost" onClick={() => setConfirmingRemove(true)} disabled={library.isSaving}>
            <Trash2 className="mr-2 size-4" /> {t("library.remove")}
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmingRemove}
        onOpenChange={setConfirmingRemove}
        title={t("library.removeConfirmTitle")}
        description={t("library.removeConfirmDescription")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          void library.remove();
          setConfirmingRemove(false);
        }}
      />
    </Panel>
  );
}
