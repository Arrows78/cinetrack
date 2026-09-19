import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Save, Trash2 } from "lucide-react";
import { AddToListButton } from "@/components/library/add-to-list-button";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating } from "@/components/ui/star-rating";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { PartialErrorState } from "@/components/states/partial-error-state";
import { toast } from "@/components/ui/use-toast";
import { useLibraryDistinctTags, useLibraryItem } from "@/features/library/use-library";
import type { LibraryStatus, MediaSummary } from "@/types/media";

export function LibraryEditor({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const library = useLibraryItem(media);
  const distinctTags = useLibraryDistinctTags();
  const [status, setStatus] = useState<LibraryStatus>("planned");
  const [userRating, setUserRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [rewatchCount, setRewatchCount] = useState(0);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  // Deliberately *not* seeded from `library.data`: if the query already has
  // this item cached at mount (e.g. revisiting a title within the same
  // session), initializing this to `library.data` would make the sync check
  // below a same-reference no-op on the very first render, leaving status/
  // favourite/etc. stuck at their blank literal defaults instead of the
  // real cached values.
  const [loadedLibraryData, setLoadedLibraryData] = useState<typeof library.data>();

  if (library.data && library.data !== loadedLibraryData) {
    setLoadedLibraryData(library.data);
    setStatus(library.data.status);
    setUserRating(library.data.userRating ?? null);
    setNotes(library.data.notes ?? "");
    setTags(library.data.tags);
    setRewatchCount(library.data.rewatchCount);
  }

  // Saving always sends all 5 fields (see save() below), and upsert_impl on
  // the Rust side merges them in as the new source of truth — never a
  // partial patch. Rendering the editable form (and its Save button) before
  // we actually know the existing state — still loading, or the fetch
  // failed — would let a click overwrite a real "watching, 8/10, tagged"
  // entry with these blank defaults. Block on both states instead of just
  // disabling Save, so there's no window where the form exists with stale
  // data underneath it.
  if (library.isLoading) {
    return (
      <Panel>
        <div className="mb-4">
          <p className="font-semibold">{t("library.myLibrary")}</p>
          <p className="text-body-sm text-muted-foreground">{t("library.description")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
        <Skeleton className="mt-4 h-14" />
        <Skeleton className="mt-4 h-24" />
      </Panel>
    );
  }

  if (library.isError) {
    return (
      <Panel>
        <div className="mb-4">
          <p className="font-semibold">{t("library.myLibrary")}</p>
          <p className="text-body-sm text-muted-foreground">{t("library.description")}</p>
        </div>
        <PartialErrorState message={t("library.loadError")} onRetry={() => void library.refetch()} />
      </Panel>
    );
  }

  const save = () =>
    library
      .save({
        status,
        // favourite is intentionally not part of this patch — FavouriteButton
        // (in the page hero) owns it now, saving immediately on its own; see
        // that component's doc comment for why splitting it out of this
        // combined save avoids two components fighting over the same field.
        userRating,
        notes: notes.trim() || null,
        // Trimmed and case-insensitively deduplicated by TagInput itself as
        // tags are added — nothing left to normalize here.
        tags,
        rewatchCount: Math.max(0, rewatchCount),
      })
      .then(() => {
        toast({ description: t("library.saved"), variant: "success" });
      })
      .catch(() => {
        // Failure toast is handled by the app-wide MutationCache error
        // handler (see query-client.ts) — nothing to do here beyond
        // preventing an unhandled rejection.
      });

  const statuses: Array<{ value: LibraryStatus; label: string }> = [
    { value: "planned", label: t("library.statuses.planned") },
    { value: "watching", label: t("library.statuses.watching") },
    { value: "paused", label: t("library.statuses.paused") },
    { value: "completed", label: t("library.statuses.completed") },
    { value: "dropped", label: t("library.statuses.dropped") },
  ];

  return (
    <Panel>
      <div className="mb-4">
        <p className="font-semibold">{t("library.myLibrary")}</p>
        <p className="text-body-sm text-muted-foreground">{t("library.description")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 text-body-sm">
          <span className="text-muted-foreground">{t("library.status")}</span>
          <Select value={status} onChange={(event) => setStatus(event.target.value as LibraryStatus)}>
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </label>
        <div className="grid gap-1 text-body-sm">
          <span className="text-muted-foreground">{t("library.myRating")}</span>
          <StarRating
            value={userRating}
            onChange={setUserRating}
            ariaLabel={t("library.myRating")}
            noneLabel={t("library.notRated")}
          />
        </div>
        <label className="grid gap-1 text-body-sm">
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

      <div className="mt-4 grid gap-1 text-body-sm">
        <span className="font-medium text-muted-foreground">{t("library.tags")}</span>
        <TagInput
          value={tags}
          onChange={setTags}
          suggestions={distinctTags.data ?? []}
          placeholder={t("library.tagsPlaceholder")}
          ariaLabel={t("library.tags")}
        />
        <span className="text-caption text-muted-foreground">{t("library.tagsHelp")}</span>
      </div>
      <label className="mt-4 grid gap-1 text-body-sm">
        <span className="text-muted-foreground">{t("library.privateNotes")}</span>
        <Textarea className="min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void save()} isLoading={library.isSaving} disabled={library.isSaving}>
          <Save className="mr-2 size-4" /> {t("library.save")}
        </Button>
        {library.data ? (
          <Button type="button" variant="ghost" onClick={() => setConfirmingRemove(true)} disabled={library.isSaving}>
            <Trash2 className="mr-2 size-4" /> {t("library.remove")}
          </Button>
        ) : null}
      </div>

      {/* Always visible, not tucked behind a collapsed accordion — right
          after marking something is the moment a user is most likely to
          also want to add it to a list. */}
      <div className="mt-4 border-t border-border pt-4">
        <p className="mb-2 text-body-sm font-medium text-muted-foreground">{t("library.lists.addToAListLabel")}</p>
        <AddToListButton media={media} />
      </div>

      <ConfirmDialog
        open={confirmingRemove}
        onOpenChange={(open) => !open && !library.isSaving && setConfirmingRemove(open)}
        title={t("library.removeConfirmTitle")}
        description={t("library.removeConfirmDescription")}
        confirmLabel={t("library.remove")}
        cancelLabel={t("common.cancel")}
        isConfirming={library.isSaving}
        onConfirm={() => {
          void library
            .remove()
            .then(() => setConfirmingRemove(false))
            .catch(() => {});
        }}
      />
    </Panel>
  );
}
