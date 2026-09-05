import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { BulkActionBar } from "@/components/media/library/bulk-action-bar";
import { useLibrary } from "@/features/library/use-library";
import { useLibraryHealthActions } from "@/features/library/use-library-health-actions";
import {
  selectMissingMetadataItems,
  selectProbableDuplicates,
  selectStalePlannedItems,
  type DuplicateGroup,
} from "@/features/library/use-library-health-selectors";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import fallbackPoster from "@/assets/poster-placeholder.svg";
import type { LibraryItem } from "@/types/media";

const itemKey = (item: LibraryItem) => `${item.mediaType}-${item.mediaId}`;

// Two full branches (rather than one Link with a conditionally-computed
// to/params pair) — same convention weekly-agenda-section.tsx and
// needs-attention-section.tsx already use, since the router's typed routes
// need a literal `to` at the call site to correctly narrow `params`.
function ItemLink({ item, children }: { item: LibraryItem; children: ReactNode }) {
  return item.mediaType === "movie" ? (
    <Link
      to="/movies/$movieId"
      params={{ movieId: String(item.mediaId) }}
      className="flex min-w-0 flex-1 items-center gap-3"
    >
      {children}
    </Link>
  ) : (
    <Link
      to="/series/$seriesId"
      params={{ seriesId: String(item.mediaId) }}
      className="flex min-w-0 flex-1 items-center gap-3"
    >
      {children}
    </Link>
  );
}

function SelectableItemRow({
  item,
  checked,
  onToggle,
  badge,
}: {
  item: LibraryItem;
  checked: boolean;
  onToggle: () => void;
  badge?: ReactNode;
}) {
  const { t } = useTranslation();
  const poster = buildTmdbImageUrl(item.posterPath, "w92") ?? fallbackPoster;

  return (
    <Tile className="flex items-center gap-3 px-3 py-2.5">
      <Checkbox
        checked={checked}
        onChange={onToggle}
        aria-label={t("library.health.selectItem", { title: item.title })}
      />
      <ItemLink item={item}>
        <img src={poster} alt="" loading="lazy" className="h-12 w-8 shrink-0 rounded object-cover" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</p>
      </ItemLink>
      {badge}
    </Tile>
  );
}

function DuplicateGroupRow({
  group,
  onDismiss,
  onRemoveItem,
}: {
  group: DuplicateGroup;
  onDismiss: () => void;
  onRemoveItem: (item: LibraryItem) => void;
}) {
  const { t } = useTranslation();

  return (
    <Tile className="space-y-2 p-3">
      <div className="flex flex-wrap gap-2">
        {group.items.map((item) => (
          <div
            key={itemKey(item)}
            className="flex items-center rounded-lg border border-border pr-1 hover:bg-foreground/[0.04]"
          >
            <ItemLink item={item}>
              <span className="truncate px-2 py-1.5 text-sm font-medium">
                {item.title}
                {item.year ? <span className="ml-1 text-xs text-muted-foreground">({item.year})</span> : null}
              </span>
            </ItemLink>
            <button
              type="button"
              onClick={() => onRemoveItem(item)}
              aria-label={t("library.health.duplicatesRemoveItem", { title: item.title })}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
        {t("library.health.duplicatesNotDuplicate")}
      </Button>
    </Tile>
  );
}

/**
 * The Library page's health surface — probable duplicates, items missing
 * poster/genre metadata, and "planned" items forgotten for weeks, each with
 * a bulk action and a session-only undo toast (no persisted undo log — a
 * page refresh loses the ability to undo). Self-fetches via useLibrary();
 * renders nothing once every signal is empty, same convention as the Today
 * Hub.
 */
export function LibraryHealthPanel({ index }: { index: number }) {
  const { t } = useTranslation();
  const libraryQuery = useLibrary();
  const actions = useLibraryHealthActions();
  const items = useMemo(() => libraryQuery.data ?? [], [libraryQuery.data]);

  const duplicates = useMemo(() => selectProbableDuplicates(items), [items]);
  const missingMetadata = useMemo(() => selectMissingMetadataItems(items), [items]);
  const stalePlanned = useMemo(() => selectStalePlannedItems(items, new Date()), [items]);

  const [dismissedDuplicateKeys, setDismissedDuplicateKeys] = useState<Set<string>>(new Set());
  const [selectedMissingKeys, setSelectedMissingKeys] = useState<Set<string>>(new Set());
  const [selectedStaleKeys, setSelectedStaleKeys] = useState<Set<string>>(new Set());
  // Shared by both the missing-metadata bulk button and a single duplicate's
  // own remove button below — either way it's the same irreversible action
  // on the same set of items, so one confirm dialog covers both.
  const [pendingRemoval, setPendingRemoval] = useState<LibraryItem[] | null>(null);

  const visibleDuplicates = duplicates.filter((group) => !dismissedDuplicateKeys.has(group.key));
  const selectedMissingItems = missingMetadata.filter((item) => selectedMissingKeys.has(itemKey(item)));
  const selectedStaleItems = stalePlanned
    .map(({ item }) => item)
    .filter((item) => selectedStaleKeys.has(itemKey(item)));

  const toggleKey = (setter: typeof setSelectedMissingKeys, key: string) =>
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const runRemove = async () => {
    const removed = pendingRemoval ?? [];
    setPendingRemoval(null);
    setSelectedMissingKeys(new Set());
    await actions.remove(removed);
    toast({
      description: t("library.health.undoRemovedDescription", { count: removed.length }),
      action: (
        <ToastAction altText={t("library.health.undoAltText")} onClick={() => void actions.restore(removed)}>
          {t("library.health.undoCta")}
        </ToastAction>
      ),
    });
  };

  const runMarkDropped = async () => {
    const changed = selectedStaleItems;
    setSelectedStaleKeys(new Set());
    await actions.setStatus(changed, "dropped");
    toast({
      description: t("library.health.undoDroppedDescription", { count: changed.length }),
      action: (
        <ToastAction altText={t("library.health.undoAltText")} onClick={() => void actions.restoreStatus(changed)}>
          {t("library.health.undoCta")}
        </ToastAction>
      ),
    });
  };

  const hasAnyContent = visibleDuplicates.length > 0 || missingMetadata.length > 0 || stalePlanned.length > 0;
  if (libraryQuery.isLoading || !hasAnyContent) return null;

  return (
    <section>
      <SectionHeader title={t("library.health.title")} subtitle={t("library.health.subtitle")} index={index} />
      <Panel tone="highlight" className="space-y-8">
        {visibleDuplicates.length > 0 ? (
          <div>
            <SectionHeader
              title={t("library.health.duplicatesTitle")}
              subtitle={t("library.health.duplicatesSubtitle")}
              size="sub"
            />
            <div className="grid gap-2 lg:grid-cols-2">
              {visibleDuplicates.map((group) => (
                <DuplicateGroupRow
                  key={group.key}
                  group={group}
                  onDismiss={() => setDismissedDuplicateKeys((current) => new Set(current).add(group.key))}
                  onRemoveItem={(item) => setPendingRemoval([item])}
                />
              ))}
            </div>
          </div>
        ) : null}

        {missingMetadata.length > 0 ? (
          <div className="space-y-3">
            <SectionHeader
              title={t("library.health.missingMetadataTitle")}
              subtitle={t("library.health.missingMetadataSubtitle")}
              size="sub"
            />
            <div className="grid gap-2 lg:grid-cols-2">
              {missingMetadata.map((item) => (
                <SelectableItemRow
                  key={itemKey(item)}
                  item={item}
                  checked={selectedMissingKeys.has(itemKey(item))}
                  onToggle={() => toggleKey(setSelectedMissingKeys, itemKey(item))}
                />
              ))}
            </div>
            <BulkActionBar
              selectedCount={selectedMissingItems.length}
              actions={[
                {
                  label: t("library.health.removeSelected"),
                  variant: "destructive",
                  disabled: actions.isApplying,
                  onClick: () => setPendingRemoval(selectedMissingItems),
                },
              ]}
            />
          </div>
        ) : null}

        {stalePlanned.length > 0 ? (
          <div className="space-y-3">
            <SectionHeader
              title={t("library.health.stalePlannedTitle")}
              subtitle={t("library.health.stalePlannedSubtitle")}
              size="sub"
            />
            <div className="grid gap-2 lg:grid-cols-2">
              {stalePlanned.map(({ item, daysSinceUpdate }) => (
                <SelectableItemRow
                  key={itemKey(item)}
                  item={item}
                  checked={selectedStaleKeys.has(itemKey(item))}
                  onToggle={() => toggleKey(setSelectedStaleKeys, itemKey(item))}
                  badge={
                    <Badge variant="outline">{t("home.needsAttentionStaleBadge", { days: daysSinceUpdate })}</Badge>
                  }
                />
              ))}
            </div>
            <BulkActionBar
              selectedCount={selectedStaleItems.length}
              actions={[
                {
                  label: t("library.health.markAsDropped"),
                  disabled: actions.isApplying,
                  onClick: () => void runMarkDropped(),
                },
              ]}
            />
          </div>
        ) : null}
      </Panel>

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title={t("library.health.removeConfirmTitle", { count: pendingRemoval?.length ?? 0 })}
        description={t("library.health.removeConfirmDescription")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void runRemove()}
        isConfirming={actions.isApplying}
      />
    </section>
  );
}
