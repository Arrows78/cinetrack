import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { ListPlus, Trash2, UserPlus } from "lucide-react";
import { BackupTools } from "@/components/settings/backup-tools";
import { Button } from "@/components/ui/button";
import { useCustomListItems, useCustomLists, useProfiles } from "@/hooks/use-collections";
import { usePreferences } from "@/hooks/use-local-media";

function ListContents({ listId }: { listId: string }) {
  const { t } = useTranslation();
  const items = useCustomListItems(listId);
  if (!items.data?.length) return <p className="text-sm text-muted-foreground">{t("collections.emptyList")}</p>;
  return (
    <div className="grid gap-2">
      {items.data.map((item) => (
        <div key={`${item.mediaType}-${item.mediaId}`} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
          <span>{item.title} <span className="text-muted-foreground">· {item.mediaType === "movie" ? t("collections.movie") : t("collections.series")}</span></span>
          <Button type="button" size="icon" variant="ghost" onClick={() => void items.remove({ mediaId: item.mediaId, mediaType: item.mediaType })}><Trash2 className="size-4" /></Button>
        </div>
      ))}
    </div>
  );
}

export function CollectionsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const profiles = useProfiles();
  const lists = useCustomLists();
  const preferences = usePreferences();
  const [profileName, setProfileName] = useState("");
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [openedList, setOpenedList] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <header><h1 className="font-display text-3xl font-bold">{t("collections.title")}</h1><p className="mt-1 text-muted-foreground">{t("collections.description")}</p></header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-card/60 p-5">
          <h2 className="font-semibold">{t("collections.localProfiles")}</h2>
          <div className="mt-4 flex gap-2">
            <input className="h-10 flex-1 rounded-xl border border-border bg-background px-3" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder={t("collections.profileNamePlaceholder")} />
            <Button type="button" onClick={() => void profiles.create(profileName).then(() => setProfileName(""))} disabled={!profileName.trim()}><UserPlus className="mr-2 size-4" />{t("collections.add")}</Button>
          </div>
          <div className="mt-4 grid gap-2">
            {profiles.data?.map((profile) => (
              <div key={profile.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                <button type="button" className="flex-1 text-left" onClick={() => void preferences.updatePreference({ key: "activeProfileId", value: profile.id }).then(() => client.invalidateQueries())}>
                  <span className="font-medium">{profile.name}</span>
                  {preferences.data?.activeProfileId === profile.id ? <span className="ml-2 text-xs text-primary">{t("collections.active")}</span> : null}
                </button>
                {profile.id !== "default" ? <Button type="button" size="icon" variant="ghost" onClick={() => void profiles.remove(profile.id)}><Trash2 className="size-4" /></Button> : null}
              </div>
            ))}
          </div>
        </div>

        <BackupTools />
      </section>

      <section className="rounded-3xl border border-border bg-card/60 p-5">
        <h2 className="font-semibold">{t("collections.customLists")}</h2>
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <input className="h-10 rounded-xl border border-border bg-background px-3" value={listName} onChange={(event) => setListName(event.target.value)} placeholder={t("collections.namePlaceholder")} />
          <input className="h-10 rounded-xl border border-border bg-background px-3" value={listDescription} onChange={(event) => setListDescription(event.target.value)} placeholder={t("collections.descriptionPlaceholder")} />
          <Button type="button" disabled={!listName.trim()} onClick={() => void lists.create({ name: listName, description: listDescription }).then(() => { setListName(""); setListDescription(""); })}><ListPlus className="mr-2 size-4" />{t("collections.create")}</Button>
        </div>
        <div className="mt-5 grid gap-3">
          {lists.data?.map((list) => (
            <article key={list.id} className="rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <button type="button" className="text-left" onClick={() => setOpenedList((current) => current === list.id ? null : list.id)}>
                  <h3 className="font-semibold">{list.name}</h3><p className="text-sm text-muted-foreground">{list.description || t("collections.noDescription")}</p>
                </button>
                <Button type="button" size="icon" variant="ghost" onClick={() => void lists.remove(list.id)}><Trash2 className="size-4" /></Button>
              </div>
              {openedList === list.id ? <div className="mt-4"><ListContents listId={list.id} /></div> : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
