import { useEffect, useState, startTransition } from "react";
import { useTranslation } from "react-i18next";
import { Heart, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLibraryItem } from "@/features/library/use-library";
import type { LibraryStatus, MediaSummary } from "@/types/media";

export function LibraryEditor({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const library = useLibraryItem(media);
  const [formState, setFormState] = useState(() => ({
    status: "planned" as LibraryStatus,
    favourite: false,
    userRating: "",
    notes: "",
    tags: "",
    rewatchCount: 0,
  }));

  useEffect(() => {
    if (!library.data) return;
    const data = library.data;
    startTransition(() => {
      setFormState({
        status: data.status,
        favourite: data.favourite,
        userRating: data.userRating?.toString() ?? "",
        notes: data.notes ?? "",
        tags: data.tags.join(", "),
        rewatchCount: data.rewatchCount,
      });
    });
  }, [library.data]);

  const save = () =>
    library.save({
      status: formState.status,
      favourite: formState.favourite,
      userRating: formState.userRating ? Math.min(10, Math.max(0, Number(formState.userRating))) : null,
      notes: formState.notes.trim() || null,
      tags: formState.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      rewatchCount: Math.max(0, formState.rewatchCount),
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
          variant={formState.favourite ? "default" : "outline"}
          size="icon"
          aria-label={t("library.favourite")}
          onClick={() => setFormState((prev) => ({ ...prev, favourite: !prev.favourite }))}
        >
          <Heart className={formState.favourite ? "size-4 fill-current" : "size-4"} />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">{t("library.status")}</span>
          <Select
            value={formState.status}
            onChange={(event) => setFormState((prev) => ({ ...prev, status: event.target.value as LibraryStatus }))}
          >
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
            value={formState.userRating}
            onChange={(event) => setFormState((prev) => ({ ...prev, userRating: event.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">{t("library.rewatches")}</span>
          <Input
            size="sm"
            type="number"
            min="0"
            value={formState.rewatchCount}
            onChange={(event) => setFormState((prev) => ({ ...prev, rewatchCount: Number(event.target.value) }))}
          />
        </label>
      </div>

      <label className="mt-4 grid gap-1 text-sm">
        <span className="text-muted-foreground">{t("library.tagsHelp")}</span>
        <Input
          size="sm"
          value={formState.tags}
          onChange={(event) => setFormState((prev) => ({ ...prev, tags: event.target.value }))}
          placeholder={t("library.tagsPlaceholder")}
        />
      </label>
      <label className="mt-4 grid gap-1 text-sm">
        <span className="text-muted-foreground">{t("library.privateNotes")}</span>
        <Textarea
          className="min-h-24"
          value={formState.notes}
          onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void save()} disabled={library.isSaving}>
          <Save className="mr-2 size-4" /> {t("library.save")}
        </Button>
        {library.data ? (
          <Button type="button" variant="ghost" onClick={() => void library.remove()} disabled={library.isSaving}>
            <Trash2 className="mr-2 size-4" /> {t("library.remove")}
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
