import { useTranslation } from "react-i18next";
import { Check, Lock, Pencil, Trash2, UserPlus } from "lucide-react";
import { PinPromptDialog } from "@/components/settings/pin-prompt-dialog";
import { useProfileEditor } from "@/components/settings/use-profile-editor";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { AvatarPicker } from "@/components/ui/avatar-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { Tile } from "@/components/ui/tile";
import { IconTooltip } from "@/components/ui/tooltip";
import { authConfig } from "@/features/auth";
import { useAuth } from "@/features/auth/use-auth";
import type { UserProfile } from "@/types/media";

type ProfileEditor = ReturnType<typeof useProfileEditor>;

/**
 * Inline edit form shared by both lists. `withPin` adds the PIN section,
 * only offered in the offline free-switcher list — the signed-in list never
 * shows a switcher at all (access is already gated by who's signed in), so a
 * PIN there would protect nothing.
 */
function ProfileEditForm({
  editor,
  profile,
  withPin,
  className,
}: {
  editor: ProfileEditor;
  profile: UserProfile;
  withPin: boolean;
  className: string;
}) {
  const { t } = useTranslation();
  const { profiles } = editor;
  return (
    <Tile className={className}>
      <Input
        size="sm"
        value={editor.editName}
        onChange={(event) => editor.setEditName(event.target.value)}
        aria-label={t("settings.profiles.editNameLabel")}
        maxLength={60}
      />
      <p className="text-caption text-muted-foreground">{t("profileGate.avatarLabel")}</p>
      <AvatarPicker value={editor.editAvatar} onChange={editor.setEditAvatar} disabled={profiles.isSaving} />
      {withPin ? (
        <div>
          <p className="mb-2 text-caption text-muted-foreground">{t("settings.profiles.pin.label")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              size="sm"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              className="w-28"
              value={editor.pinDraft}
              onChange={(event) => editor.setPinDraft(event.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-label={t("settings.profiles.pin.inputLabel")}
              maxLength={6}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={editor.pinDraft.length < 4 || profiles.isSaving}
              isLoading={profiles.isSaving}
              onClick={() => void editor.savePin(profile.id)}
            >
              {profile.hasPin ? t("settings.profiles.pin.changeLabel") : t("settings.profiles.pin.setLabel")}
            </Button>
            {profile.hasPin ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={profiles.isSaving}
                onClick={() => void editor.removePin(profile.id)}
              >
                {t("settings.profiles.pin.removeLabel")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          isLoading={profiles.isSaving}
          disabled={!editor.editName.trim() || profiles.isSaving}
          onClick={() => void editor.saveEdit()}
        >
          {t("settings.profiles.save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={profiles.isSaving} onClick={editor.cancelEdit}>
          {t("common.cancel")}
        </Button>
      </div>
    </Tile>
  );
}

// The signed-in list. Access to a profile is derived from who is signed in
// (see ProfileGate) — this used to be a free switcher letting anyone click
// into any local profile, which would have let a signed-in account read
// another account's data. Only the current profile is shown, read-only,
// whenever sign-in is required.
function SignedInProfile({ editor }: { editor: ProfileEditor }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentProfile } = editor;
  if (!currentProfile) {
    return <p className="text-body-sm text-muted-foreground">{t("settings.profiles.none")}</p>;
  }
  if (editor.editingProfileId === currentProfile.id) {
    return <ProfileEditForm editor={editor} profile={currentProfile} withPin={false} className="space-y-3 px-3 py-3" />;
  }
  return (
    <Tile className="flex items-center gap-3 px-3 py-3">
      <ProfileAvatar
        name={currentProfile.id === "default" ? t("settings.profiles.defaultName") : (currentProfile.name ?? "?")}
        avatar={currentProfile.avatar}
        className="size-9"
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {currentProfile.id === "default" ? t("settings.profiles.defaultName") : currentProfile.name}
        </p>
        {user?.primaryEmailAddress?.emailAddress ? (
          <p className="mt-1 text-body-sm text-muted-foreground">
            {t("settings.profiles.linkedTo", { email: user.primaryEmailAddress.emailAddress })}
          </p>
        ) : null}
      </div>
      {currentProfile.id !== "default" ? (
        <IconTooltip label={t("settings.profiles.edit", { name: currentProfile.name })}>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t("settings.profiles.edit", { name: currentProfile.name })}
            onClick={() => editor.startEdit(currentProfile)}
          >
            <Pencil className="size-4" />
          </Button>
        </IconTooltip>
      ) : null}
    </Tile>
  );
}

// No account is in play at all offline — set_active_profile
// (src-tauri/src/preferences/) only ever rejects a switch into a profile
// that's linked to one, so free switching between these local-only profiles
// is safe.
function OfflineProfileList({
  editor,
  activeProfileId,
}: {
  editor: ProfileEditor;
  activeProfileId: string | undefined;
}) {
  const { t } = useTranslation();
  const { profiles, switchingProfileId } = editor;
  return (
    <div className="space-y-3">
      {(profiles.data ?? []).map((profile) => {
        const isActive = profile.id === activeProfileId;
        const label = profile.id === "default" ? t("settings.profiles.defaultName") : profile.name;
        if (editor.editingProfileId === profile.id) {
          return (
            <ProfileEditForm
              key={profile.id}
              editor={editor}
              profile={profile}
              withPin
              className="space-y-3 px-3 py-2.5"
            />
          );
        }
        return (
          <Tile key={profile.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left text-body-sm font-medium disabled:cursor-default"
              disabled={isActive || switchingProfileId !== null}
              onClick={() => editor.requestSwitch(profile)}
            >
              <ProfileAvatar name={label ?? "?"} avatar={profile.avatar} className="size-7 text-caption" />
              <span className="truncate">{label}</span>
              {profile.hasPin ? (
                <Lock
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-label={t("settings.profiles.pin.locked")}
                />
              ) : null}
              {isActive ? (
                <Badge variant="success" className="gap-1">
                  <Check className="size-3" aria-hidden="true" />
                  {t("settings.profiles.active")}
                </Badge>
              ) : null}
            </button>
            {profile.id !== "default" ? (
              <IconTooltip label={t("settings.profiles.edit", { name: label })}>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("settings.profiles.edit", { name: label })}
                  disabled={switchingProfileId !== null}
                  onClick={() => editor.startEdit(profile)}
                >
                  <Pencil className="size-4" />
                </Button>
              </IconTooltip>
            ) : null}
            <IconTooltip
              label={
                profile.id === "default"
                  ? t("settings.profiles.defaultCannotDelete")
                  : t("settings.profiles.delete", { name: label })
              }
            >
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={
                  profile.id === "default"
                    ? t("settings.profiles.defaultCannotDelete")
                    : t("settings.profiles.delete", { name: label })
                }
                disabled={profile.id === "default" || switchingProfileId !== null}
                onClick={() =>
                  editor.withUnlock(profile, (pin) => {
                    editor.setDeleteUnlockPin(pin);
                    editor.setPendingDeleteProfile(profile);
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </IconTooltip>
          </Tile>
        );
      })}
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            size="sm"
            value={editor.newProfileName}
            onChange={(event) => editor.setNewProfileName(event.target.value)}
            placeholder={t("settings.profiles.newNamePlaceholder")}
            aria-label={t("settings.profiles.newNameLabel")}
            maxLength={60}
          />
          <Button
            type="button"
            variant="outline"
            isLoading={profiles.isSaving}
            disabled={!editor.newProfileName.trim() || profiles.isSaving}
            onClick={() => void editor.createProfile()}
          >
            <UserPlus className="mr-2 size-4" />
            {t("settings.profiles.create")}
          </Button>
        </div>
        <div>
          <p className="mb-2 text-caption text-muted-foreground">{t("profileGate.avatarLabel")}</p>
          <AvatarPicker
            value={editor.newProfileAvatar}
            onChange={editor.setNewProfileAvatar}
            disabled={profiles.isSaving}
          />
        </div>
      </div>
    </div>
  );
}

export function ProfilesCard({ activeProfileId }: { activeProfileId: string | undefined }) {
  const { t } = useTranslation();
  const editor = useProfileEditor(activeProfileId);
  const { profiles, pendingDeleteProfile, pinChallenge } = editor;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.profiles.title")}</CardTitle>
        <CardDescription>{t("settings.profiles.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {profiles.isError ? (
          <RemoteErrorState error={profiles.error} onRetry={() => void profiles.refetch()} />
        ) : authConfig.required ? (
          <SignedInProfile editor={editor} />
        ) : (
          <OfflineProfileList editor={editor} activeProfileId={activeProfileId} />
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingDeleteProfile !== null}
        onOpenChange={(open) => !open && !profiles.isSaving && editor.setPendingDeleteProfile(null)}
        title={t("settings.profiles.deleteConfirmTitle", {
          name:
            pendingDeleteProfile?.id === "default" ? t("settings.profiles.defaultName") : pendingDeleteProfile?.name,
        })}
        description={t("settings.profiles.deleteConfirmDescription")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        isConfirming={profiles.isSaving}
        onConfirm={() => {
          if (!pendingDeleteProfile) return;
          const target = pendingDeleteProfile;
          // Failure toast is handled by the app-wide MutationCache error
          // handler (see query-client.ts) — the dialog stays open (and
          // isConfirming clears) so the user can retry instead of losing
          // their place; the catch here only prevents an unhandled
          // rejection, it doesn't need to do anything itself.
          void profiles
            .remove({ id: target.id, currentPin: editor.deleteUnlockPin })
            .then(() => editor.setPendingDeleteProfile(null))
            .catch(() => {});
        }}
      />

      <PinPromptDialog
        open={pinChallenge !== null}
        profileName={
          pinChallenge?.profile.id === "default"
            ? t("settings.profiles.defaultName")
            : (pinChallenge?.profile.name ?? "")
        }
        onOpenChange={(open) => !open && editor.setPinChallenge(null)}
        onVerify={(pin) => profiles.verifyPin(pinChallenge!.profile.id, pin)}
        onSuccess={(pin) => {
          const challenge = pinChallenge;
          editor.setPinChallenge(null);
          challenge?.onUnlocked(pin);
        }}
      />
    </Card>
  );
}
