import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ListPlus, Trash2 } from "lucide-react";
import { BackupTools } from "@/components/settings/backup-tools";
import { TvTimeImportCard } from "@/components/settings/tvtime-import-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useAuth } from "@/features/auth/auth-context";
import { useCustomListItems, useCustomLists, useProfiles } from "@/features/collections/use-collections";
import { usePreferences } from "@/features/preferences/use-preferences";
import { staggerDelayMs } from "@/shared/utils/animation";

function ListContents({ listId }: { listId: string }) {
  const { t } = useTranslation();
  const items = useCustomListItems(listId);
  if (!items.data?.length) return <p className="text-sm text-muted-foreground">{t("collections.emptyList")}</p>;
  return (
    <div className="grid gap-2">
      {items.data.map((item) => (
        <div
          key={`${item.mediaType}-${item.mediaId}`}
          className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
        >
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
            onClick={() => void items.remove({ mediaId: item.mediaId, mediaType: item.mediaType })}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function CollectionsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const profiles = useProfiles();
  const lists = useCustomLists();
  const preferences = usePreferences();
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [openedList, setOpenedList] = useState<string | null>(null);

  const currentProfile = profiles.data?.find((profile) => profile.id === preferences.data?.activeProfileId);

  return (
    <div className="space-y-8">
      <header className="animate-in" style={{ animationDelay: `${staggerDelayMs(0)}ms` }}>
        <h1 className="font-display text-3xl font-bold">{t("collections.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("collections.description")}</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2 animate-in" style={{ animationDelay: `${staggerDelayMs(1)}ms` }}>
        <Panel>
          <h2 className="font-semibold">{t("collections.localProfiles")}</h2>
          {/*
            Access to a profile is derived from who is signed in (see
            ProfileGate) — this used to be a free switcher letting anyone
            click into any local profile, which would have let a signed-in
            account read another account's data. Only the current profile
            is shown here now, read-only.
          */}
          {currentProfile ? (
            <div className="mt-4 rounded-xl border border-border px-3 py-3">
              <p className="font-medium">{currentProfile.name}</p>
              {user?.email ? (
                <p className="mt-1 text-sm text-muted-foreground">{t("collections.linkedTo", { email: user.email })}</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{t("collections.noProfile")}</p>
          )}
        </Panel>

        <BackupTools />

        <TvTimeImportCard />
      </section>

      <Panel className="animate-in" style={{ animationDelay: `${staggerDelayMs(2)}ms` }}>
        <h2 className="font-semibold">{t("collections.customLists")}</h2>
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <Input
            size="sm"
            value={listName}
            onChange={(event) => setListName(event.target.value)}
            placeholder={t("collections.namePlaceholder")}
          />
          <Input
            size="sm"
            value={listDescription}
            onChange={(event) => setListDescription(event.target.value)}
            placeholder={t("collections.descriptionPlaceholder")}
          />
          <Button
            type="button"
            disabled={!listName.trim()}
            onClick={() =>
              void lists.create({ name: listName, description: listDescription }).then(() => {
                setListName("");
                setListDescription("");
              })
            }
          >
            <ListPlus className="mr-2 size-4" />
            {t("collections.create")}
          </Button>
        </div>
        <div className="mt-5 grid gap-3">
          {lists.data?.map((list) => (
            <article key={list.id} className="rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="text-left"
                  onClick={() => setOpenedList((current) => (current === list.id ? null : list.id))}
                >
                  <h3 className="font-semibold">{list.name}</h3>
                  <p className="text-sm text-muted-foreground">{list.description || t("collections.noDescription")}</p>
                </button>
                <Button type="button" size="icon" variant="ghost" onClick={() => void lists.remove(list.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {openedList === list.id ? (
                <div className="mt-4">
                  <ListContents listId={list.id} />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
