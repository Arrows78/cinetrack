import { useState } from "react";
import { useProfiles, useProfileSwitching } from "@/features/profiles/use-profiles";
import type { AvatarPresetKey } from "@/shared/constants/colors";
import type { UserProfile } from "@/types/media";

/**
 * State and actions behind ProfilesCard: create / edit / delete a profile,
 * its PIN, and the PIN challenge that gates acting on a protected profile.
 */
export function useProfileEditor(activeProfileId: string | undefined) {
  const profiles = useProfiles();
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileAvatar, setNewProfileAvatar] = useState<AvatarPresetKey | null>(null);
  const [pendingDeleteProfile, setPendingDeleteProfile] = useState<UserProfile | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState<AvatarPresetKey | null>(null);
  const [pinDraft, setPinDraft] = useState("");
  // A PIN-protected profile other than the active one can't be switched
  // into, edited, or deleted without its PIN — Rust enforces this too (see
  // authorize_pin_protected_access), the prompt just collects it first.
  const [pinChallenge, setPinChallenge] = useState<{
    profile: UserProfile;
    onUnlocked: (pin: string) => void;
  } | null>(null);
  const [editUnlockPin, setEditUnlockPin] = useState<string | null>(null);
  const [deleteUnlockPin, setDeleteUnlockPin] = useState<string | null>(null);
  // See useProfileSwitching's own doc comment for why a free switcher here
  // is safe (and only ever offered when auth isn't required — the read-only
  // branch below).
  const { switchingProfileId, switchToProfile } = useProfileSwitching();

  // Only offered in the offline free-switcher branch below — the signed-in
  // branch never shows a switcher at all (access is already gated by who's
  // signed in), so a PIN there would protect nothing.
  const withUnlock = (profile: UserProfile, action: (pin: string | null) => void) => {
    if (profile.hasPin && profile.id !== activeProfileId) {
      setPinChallenge({ profile, onUnlocked: action });
      return;
    }
    action(null);
  };

  const requestSwitch = (profile: UserProfile) =>
    withUnlock(profile, (pin) => void switchToProfile(profile.id, pin ?? undefined));

  const savePin = async (id: string) => {
    if (pinDraft.length < 4) return;
    try {
      await profiles.setPin({ id, pin: pinDraft, currentPin: editUnlockPin });
      // The new PIN is what unlocks this profile from now on.
      if (editUnlockPin !== null) setEditUnlockPin(pinDraft);
      setPinDraft("");
    } catch {
      // Failure toast is handled by the app-wide MutationCache error
      // handler (see query-client.ts).
    }
  };
  const removePin = async (id: string) => {
    try {
      await profiles.clearPin({ id, currentPin: editUnlockPin });
      setPinDraft("");
    } catch {
      // Failure toast is handled by the app-wide MutationCache error
      // handler (see query-client.ts).
    }
  };

  const currentProfile = profiles.data?.find((profile) => profile.id === activeProfileId);

  const createProfile = async () => {
    const name = newProfileName.trim();
    if (!name) return;
    try {
      await profiles.create({ name, avatar: newProfileAvatar });
      setNewProfileName("");
      setNewProfileAvatar(null);
    } catch {
      // Failure toast is handled by the app-wide MutationCache error
      // handler (see query-client.ts).
    }
  };

  // The "default" profile always displays a fixed, translated name (see
  // ProfilesCard) regardless of what's stored — renaming it
  // would change data that never visibly shows, so its edit control is
  // disabled, same as its delete button already is.
  const startEdit = (profile: UserProfile) =>
    withUnlock(profile, (pin) => {
      setEditUnlockPin(pin);
      setEditingProfileId(profile.id);
      setEditName(profile.name ?? "");
      setEditAvatar((profile.avatar as AvatarPresetKey | null) ?? null);
      setPinDraft("");
    });
  const cancelEdit = () => {
    setEditingProfileId(null);
    setEditUnlockPin(null);
    setPinDraft("");
  };
  const saveEdit = async () => {
    const name = editName.trim();
    const id = editingProfileId;
    if (!id || !name) return;
    try {
      await profiles.update({ id, name, avatar: editAvatar, currentPin: editUnlockPin });
      setEditingProfileId(null);
      setEditUnlockPin(null);
    } catch {
      // Failure toast is handled by the app-wide MutationCache error
      // handler (see query-client.ts) — the inline form stays open so the
      // user can retry.
    }
  };

  return {
    profiles,
    currentProfile,
    switchingProfileId,
    newProfileName,
    setNewProfileName,
    newProfileAvatar,
    setNewProfileAvatar,
    pendingDeleteProfile,
    setPendingDeleteProfile,
    editingProfileId,
    editName,
    setEditName,
    editAvatar,
    setEditAvatar,
    pinDraft,
    setPinDraft,
    pinChallenge,
    setPinChallenge,
    deleteUnlockPin,
    setDeleteUnlockPin,
    withUnlock,
    requestSwitch,
    savePin,
    removePin,
    createProfile,
    startEdit,
    cancelEdit,
    saveEdit,
  };
}
