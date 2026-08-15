import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ListPlus, Trash2, UserPlus } from "lucide-react";
import { BackupTools } from "@/components/settings/backup-tools";
import { TvTimeImportCard } from "@/components/settings/tvtime-import-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FilterBar } from "@/components/media/filter-bar";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { toast } from "@/components/ui/use-toast";
import { LoadingState } from "@/components/states/loading-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { authConfig } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-context";
import { useCustomListItems, useCustomLists, useProfiles } from "@/features/collections/use-collections";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { usePreferences } from "@/features/preferences/use-preferences";
import { staggerDelayMs } from "@/shared/utils/animation";
import type { MediaType, UserProfile } from "@/types/media";

function ListContents({ listId }: { listId: string }) {
  const { t } = useTranslation();
  const items = useCustomListItems(listId);
  const [pendingRemoval, setPendingRemoval] = useState<{ mediaId: number; mediaType: MediaType; title: string } | null>(
    null
  );
  const [removeError, setRemoveError] = useState<string | null>(null);

  if (items.isLoading) return <LoadingState />;
  if (items.isError) {
    return <RemoteErrorState error={items.error} onRetry={() => void items.refetch()} />;
  }
  if (!items.data?.length) return <p className="text-sm text-muted-foreground">{t("collections.emptyList")}</p>;
  return (
    <div className="grid gap-2">
      {items.data.map((item) => (
        <Tile key={`${item.mediaType}-${item.mediaId}`} className="flex items-center justify-between px-3 py-2 text-sm">
          <span>
            {item.title}{" "}
            <span className="text-muted-foreground">
              · {item.mediaType === "movie" ? t("collections.movie") : t("collections.series")}
            </span>
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t("collections.removeItem", { title: item.title })}
            onClick={() => setPendingRemoval({ mediaId: item.mediaId, mediaType: item.mediaType, title: item.title })}
          >
            <Trash2 className="size-4" />
          </Button>
        </Tile>
      ))}
      {removeError ? <p className="text-sm text-destructive">{removeError}</p> : null}
      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title={t("collections.removeItemConfirmTitle", { title: pendingRemoval?.title })}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (!pendingRemoval) return;
          setRemoveError(null);
          void items
            .remove({ mediaId: pendingRemoval.mediaId, mediaType: pendingRemoval.mediaType })
            // Generic message only — the raw error (SQL/IPC detail) isn't
            // shown here, unlike RemoteErrorState's opt-in "technical
            // details" disclosure, since this compact inline slot has no
            // room for that pattern.
            .catch(() => setRemoveError(t("desktop.operationFailed")));
          setPendingRemoval(null);
        }}
      />
    </div>
  );
}

export function CollectionsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const profiles = useProfiles();
  const lists = useCustomLists();
  const preferences = usePreferences();
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [openedList, setOpenedList] = useState<string | null>(null);
  const [pendingDeleteList, setPendingDeleteList] = useState<{ id: string; name: string } | null>(null);
  const [listSort, setListSort] = useState<"recent" | "name">("recent");
  const [listActionError, setListActionError] = useState<string | null>(null);

  const [newProfileName, setNewProfileName] = useState("");
  const [pendingDeleteProfile, setPendingDeleteProfile] = useState<UserProfile | null>(null);
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null);

  const currentProfile = profiles.data?.find((profile) => profile.id === preferences.data?.activeProfileId);

  // Only ever offered when auth isn't required (see the comment on the
  // read-only branch below for why a free switcher is otherwise a security
  // hole) — and set_active_profile itself refuses to switch into a profile
  // linked to a Supabase account without proof of that account, so this
  // can't be used to hop into somebody else's claimed profile even if auth
  // gets turned on later without this UI being hidden in time.
  const switchToProfile = async (profileId: string) => {
    setSwitchingProfileId(profileId);
    try {
      await preferencesRepository.setActiveProfile(profileId);
      queryClient.removeQueries({ queryKey: ["local"] });
    } catch {
      toast({ description: t("collections.switchProfileFailed"), variant: "error" });
    } finally {
      setSwitchingProfileId(null);
    }
  };

  const createProfile = async () => {
    const name = newProfileName.trim();
    if (!name) return;
    try {
      await profiles.create(name);
      setNewProfileName("");
    } catch {
      toast({ description: t("collections.createProfileFailed"), variant: "error" });
    }
  };

  const sortedLists = useMemo(() => {
    const base = lists.data ?? [];
    if (listSort === "name") return base.slice().sort((a, b) => a.name.localeCompare(b.name));
    return base;
  }, [lists.data, listSort]);

  return (
    <div className="space-y-8">
      <header className="animate-in" style={{ animationDelay: `${staggerDelayMs(0)}ms` }}>
        <h1 className="font-display text-3xl font-bold">{t("collections.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("collections.description")}</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2 animate-in" style={{ animationDelay: `${staggerDelayMs(1)}ms` }}>
        <Panel>
          <h2 className="font-semibold">{t("collections.localProfiles")}</h2>
          {profiles.isError ? (
            <div className="mt-4">
              <RemoteErrorState error={profiles.error} onRetry={() => void profiles.refetch()} />
            </div>
          ) : authConfig.required ? (
            // Access to a profile is derived from who is signed in (see
            // ProfileGate) — this used to be a free switcher letting anyone
            // click into any local profile, which would have let a signed-in
            // account read another account's data. Only the current profile
            // is shown here now, read-only, whenever sign-in is required.
            currentProfile ? (
              <Tile className="mt-4 px-3 py-3">
                <p className="font-medium">
                  {currentProfile.id === "default" ? t("collections.defaultProfileName") : currentProfile.name}
                </p>
                {user?.email ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("collections.linkedTo", { email: user.email })}
                  </p>
                ) : null}
              </Tile>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">{t("collections.noProfile")}</p>
            )
          ) : (
            // No Supabase account is in play at all offline — set_active_profile
            // (src-tauri/src/commands/preferences.rs) only ever rejects a switch
            // into a profile that's linked to one, so free switching between
            // these local-only profiles is safe.
            <div className="mt-4 space-y-3">
              {(profiles.data ?? []).map((profile) => {
                const isActive = profile.id === preferences.data?.activeProfileId;
                const label = profile.id === "default" ? t("collections.defaultProfileName") : profile.name;
                return (
                  <Tile key={profile.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium disabled:cursor-default"
                      disabled={isActive || switchingProfileId !== null}
                      onClick={() => void switchToProfile(profile.id)}
                    >
                      <span className="truncate">{label}</span>
                      {isActive ? (
                        <Badge variant="success" className="gap-1">
                          <Check className="size-3" aria-hidden="true" />
                          {t("collections.activeProfile")}
                        </Badge>
                      ) : null}
                    </button>
                    {profile.id !== "default" ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t("collections.deleteProfile", { name: label })}
                        disabled={switchingProfileId !== null}
                        onClick={() => setPendingDeleteProfile(profile)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </Tile>
                );
              })}
              <div className="flex gap-2">
                <Input
                  size="sm"
                  value={newProfileName}
                  onChange={(event) => setNewProfileName(event.target.value)}
                  placeholder={t("collections.newProfileNamePlaceholder")}
                  aria-label={t("collections.newProfileNameLabel")}
                  maxLength={60}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!newProfileName.trim() || profiles.isSaving}
                  onClick={() => void createProfile()}
                >
                  <UserPlus className="mr-2 size-4" />
                  {t("collections.createProfile")}
                </Button>
              </div>
            </div>
          )}
        </Panel>

        <BackupTools />

        <TvTimeImportCard />
      </section>

      <Panel className="animate-in" style={{ animationDelay: `${staggerDelayMs(2)}ms` }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{t("collections.customLists")}</h2>
          {(lists.data?.length ?? 0) > 1 ? (
            <FilterBar
              value={listSort}
              onChange={setListSort}
              options={[
                { value: "recent", label: t("collections.sortRecent") },
                { value: "name", label: t("collections.sortName") },
              ]}
            />
          ) : null}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <Input
            size="sm"
            value={listName}
            onChange={(event) => setListName(event.target.value)}
            placeholder={t("collections.namePlaceholder")}
            aria-label={t("collections.listNameLabel")}
            maxLength={100}
          />
          <Input
            size="sm"
            value={listDescription}
            onChange={(event) => setListDescription(event.target.value)}
            placeholder={t("collections.descriptionPlaceholder")}
            aria-label={t("collections.listDescriptionLabel")}
          />
          <Button
            type="button"
            disabled={!listName.trim()}
            onClick={() => {
              setListActionError(null);
              void lists
                .create({ name: listName, description: listDescription })
                .then(() => {
                  setListName("");
                  setListDescription("");
                })
                .catch(() => setListActionError(t("desktop.operationFailed")));
            }}
          >
            <ListPlus className="mr-2 size-4" />
            {t("collections.create")}
          </Button>
        </div>
        {listActionError ? <p className="mt-3 text-sm text-destructive">{listActionError}</p> : null}
        {lists.isLoading ? (
          <LoadingState className="mt-5" />
        ) : lists.isError ? (
          <div className="mt-5">
            <RemoteErrorState error={lists.error} onRetry={() => void lists.refetch()} />
          </div>
        ) : sortedLists.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">{t("collections.noLists")}</p>
        ) : (
          <div className="mt-5 grid gap-3">
            {sortedLists.map((list) => (
              <Tile asChild key={list.id} className="p-4">
                <article>
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => setOpenedList((current) => (current === list.id ? null : list.id))}
                    >
                      <h3 className="font-semibold">{list.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {list.description || t("collections.noDescription")}
                      </p>
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("collections.deleteList", { name: list.name })}
                      onClick={() => setPendingDeleteList({ id: list.id, name: list.name })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  {openedList === list.id ? (
                    <div className="mt-4">
                      <ListContents listId={list.id} />
                    </div>
                  ) : null}
                </article>
              </Tile>
            ))}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={pendingDeleteList !== null}
        onOpenChange={(open) => !open && setPendingDeleteList(null)}
        title={t("collections.deleteListConfirmTitle", { name: pendingDeleteList?.name })}
        description={t("collections.deleteListConfirmDescription")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (!pendingDeleteList) return;
          setListActionError(null);
          void lists.remove(pendingDeleteList.id).catch(() => setListActionError(t("desktop.operationFailed")));
          setPendingDeleteList(null);
        }}
      />

      <ConfirmDialog
        open={pendingDeleteProfile !== null}
        onOpenChange={(open) => !open && setPendingDeleteProfile(null)}
        title={t("collections.deleteProfileConfirmTitle", {
          name:
            pendingDeleteProfile?.id === "default" ? t("collections.defaultProfileName") : pendingDeleteProfile?.name,
        })}
        description={t("collections.deleteProfileConfirmDescription")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (!pendingDeleteProfile) return;
          const target = pendingDeleteProfile;
          setPendingDeleteProfile(null);
          void profiles.remove(target.id).catch(() => {
            toast({ description: t("collections.deleteProfileFailed"), variant: "error" });
          });
        }}
      />
    </div>
  );
}
