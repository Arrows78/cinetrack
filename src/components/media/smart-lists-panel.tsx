import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ListPlus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SettingToggle } from "@/components/ui/setting-toggle";
import { Tile } from "@/components/ui/tile";
import { IconTooltip } from "@/components/ui/tooltip";
import { LoadingState } from "@/components/states/loading-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import {
  DEFAULT_SMART_LIST_RULES,
  NO_SMART_LIST_SELECTED,
  SMART_LIST_PROVIDER_ANY,
  SMART_LIST_PROVIDER_MINE,
} from "@/features/library/smart-list-evaluation";
import type { useSmartLists } from "@/features/library/use-smart-lists";
import { useMergedGenres } from "@/features/media/use-merged-genres";
import { usePreferences } from "@/features/preferences/use-preferences";
import { PLATFORMS } from "@/shared/constants/discover";
import { cn } from "@/shared/lib/cn";
import type { LibraryStatus, SmartListMediaTypeFilter, SmartListRules } from "@/types/media";

const STATUS_OPTIONS: Array<LibraryStatus | "any"> = ["any", "planned", "watching", "paused", "completed", "dropped"];

function SmartListForm({
  initialName,
  initialRules,
  onCancel,
  onSubmit,
  isSaving,
  submitLabel,
}: {
  initialName: string;
  initialRules: SmartListRules;
  onCancel?: () => void;
  onSubmit: (name: string, rules: SmartListRules) => void;
  isSaving: boolean;
  submitLabel: string;
}) {
  const { t } = useTranslation();
  const genres = useMergedGenres();
  const preferences = usePreferences();
  const preferredProviderIds = preferences.data?.preferredProviderIds ?? [];
  const [name, setName] = useState(initialName);
  const [rules, setRules] = useState<SmartListRules>(initialRules);

  const providerValue =
    rules.provider === SMART_LIST_PROVIDER_ANY || rules.provider === SMART_LIST_PROVIDER_MINE
      ? rules.provider
      : String(rules.provider);

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label={t("library.smartLists.nameLabel")}>
          {() => (
            <Input
              size="sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("library.smartLists.namePlaceholder")}
              maxLength={100}
            />
          )}
        </FormField>
        <FormField label={t("library.smartLists.statusLabel")}>
          {() => (
            <Select
              value={rules.status}
              onChange={(event) =>
                setRules((current) => ({ ...current, status: event.target.value as LibraryStatus | "any" }))
              }
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status === "any" ? t("settings.all") : t(`library.statuses.${status}`)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label={t("library.smartLists.mediaTypeLabel")}>
          {() => (
            <Select
              value={rules.mediaType}
              onChange={(event) =>
                setRules((current) => ({
                  ...current,
                  mediaType: event.target.value as SmartListMediaTypeFilter,
                }))
              }
            >
              <option value="any">{t("settings.all")}</option>
              <option value="movie">{t("nav.movies")}</option>
              <option value="series">{t("nav.series")}</option>
            </Select>
          )}
        </FormField>
        <FormField label={t("library.smartLists.genreLabel")}>
          {() => (
            <Select
              value={rules.genre ?? ""}
              onChange={(event) => setRules((current) => ({ ...current, genre: event.target.value || null }))}
            >
              <option value="">{t("settings.all")}</option>
              {genres.map((genre) => (
                <option key={genre.id} value={genre.label}>
                  {t(genre.labelKey)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label={t("library.smartLists.maxRuntimeLabel")}>
          {() => (
            <Input
              size="sm"
              type="number"
              min="1"
              step="5"
              value={rules.maxRuntimeMinutes ?? ""}
              onChange={(event) =>
                setRules((current) => ({
                  ...current,
                  maxRuntimeMinutes: event.target.value ? Number(event.target.value) : null,
                }))
              }
              placeholder={t("library.smartLists.maxRuntimePlaceholder")}
            />
          )}
        </FormField>
        <FormField label={t("library.smartLists.minRatingLabel")}>
          {() => (
            <Input
              size="sm"
              type="number"
              min="0"
              max="10"
              step="0.5"
              value={rules.minRating ?? ""}
              onChange={(event) =>
                setRules((current) => ({
                  ...current,
                  minRating: event.target.value ? Number(event.target.value) : null,
                }))
              }
              placeholder={t("library.smartLists.minRatingPlaceholder")}
            />
          )}
        </FormField>
        <FormField label={t("library.smartLists.providerLabel")}>
          {() => (
            <Select
              value={providerValue}
              onChange={(event) => {
                const value = event.target.value;
                setRules((current) => ({
                  ...current,
                  provider:
                    value === SMART_LIST_PROVIDER_ANY || value === SMART_LIST_PROVIDER_MINE ? value : Number(value),
                }));
              }}
            >
              <option value={SMART_LIST_PROVIDER_ANY}>{t("watchTonight.allPlatforms")}</option>
              {preferredProviderIds.length > 0 ? (
                <option value={SMART_LIST_PROVIDER_MINE}>{t("watchTonight.myServices")}</option>
              ) : null}
              {PLATFORMS.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>
      <SettingToggle
        label={t("library.smartLists.hasEpisodeWaitingLabel")}
        pressed={rules.hasEpisodeWaiting}
        onPressedChange={() => setRules((current) => ({ ...current, hasEpisodeWaiting: !current.hasEpisodeWaiting }))}
      />
      <div className="flex gap-2">
        <Button type="button" disabled={!name.trim() || isSaving} onClick={() => onSubmit(name, rules)}>
          <ListPlus className="mr-2 size-4" />
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("library.smartLists.cancel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// Companion to library-explorer.tsx's ListsAccordionContent (custom lists) —
// same create/edit/delete-with-confirmation shape, applied to a smart
// list's saved rule set instead of a plain name+description. Selecting a
// row (rather than its edit/delete actions) toggles it as the active smart
// list filter for the surrounding LibraryExplorer grid, mirroring the
// custom-list Select filter that already lives in that toolbar.
export function SmartListsAccordionContent({
  smartLists,
  activeSmartListId,
  onSelectSmartList,
}: {
  smartLists: ReturnType<typeof useSmartLists>;
  activeSmartListId: string;
  onSelectSmartList: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const editingList = editingId ? (smartLists.data?.find((list) => list.id === editingId) ?? null) : null;

  return (
    <div className="grid gap-4">
      <SmartListForm
        key={editingId ?? "create"}
        initialName={editingList?.name ?? ""}
        initialRules={editingList?.rules ?? DEFAULT_SMART_LIST_RULES}
        submitLabel={editingList ? t("library.smartLists.save") : t("library.smartLists.create")}
        isSaving={smartLists.isSaving}
        onCancel={editingList ? () => setEditingId(null) : undefined}
        onSubmit={(name, rules) => {
          setActionError(null);
          const action = editingList
            ? smartLists.update({ id: editingList.id, name, rules })
            : smartLists.create({ name, rules });
          void action.then(() => setEditingId(null)).catch(() => setActionError(t("desktop.operationFailed")));
        }}
      />
      {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

      {smartLists.isLoading ? (
        <LoadingState />
      ) : smartLists.isError ? (
        <RemoteErrorState error={smartLists.error} onRetry={() => void smartLists.refetch()} />
      ) : !smartLists.data?.length ? (
        <p className="text-sm text-muted-foreground">{t("library.smartLists.noLists")}</p>
      ) : (
        <div className="grid gap-2">
          {smartLists.data.map((list) => (
            <Tile
              key={list.id}
              className={cn(
                "flex items-center justify-between gap-3 p-3",
                activeSmartListId === list.id && "ring-2 ring-primary"
              )}
            >
              <button
                type="button"
                aria-pressed={activeSmartListId === list.id}
                className="min-w-0 flex-1 text-left text-sm font-medium"
                onClick={() => onSelectSmartList(activeSmartListId === list.id ? NO_SMART_LIST_SELECTED : list.id)}
              >
                {list.name}
              </button>
              <div className="flex items-center gap-1">
                <IconTooltip label={t("library.smartLists.edit", { name: list.name })}>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t("library.smartLists.edit", { name: list.name })}
                    onClick={() => setEditingId(list.id)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </IconTooltip>
                <IconTooltip label={t("library.smartLists.delete", { name: list.name })}>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t("library.smartLists.delete", { name: list.name })}
                    onClick={() => setPendingDelete({ id: list.id, name: list.name })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </IconTooltip>
              </div>
            </Tile>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("library.smartLists.deleteConfirmTitle", { name: pendingDelete?.name })}
        description={t("library.smartLists.deleteConfirmDescription")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (!pendingDelete) return;
          setActionError(null);
          const deletedId = pendingDelete.id;
          void smartLists
            .remove(deletedId)
            .then(() => {
              if (activeSmartListId === deletedId) onSelectSmartList(NO_SMART_LIST_SELECTED);
              if (editingId === deletedId) setEditingId(null);
            })
            .catch(() => setActionError(t("desktop.operationFailed")));
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
