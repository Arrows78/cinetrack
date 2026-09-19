import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tile } from "@/components/ui/tile";
import { authConfig } from "@/features/auth";
import { useAuth } from "@/features/auth/use-auth";
import { logger } from "@/shared/lib/logger";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useProfiles, useProfileSwitching } from "@/features/profiles/use-profiles";
import { cn } from "@/shared/lib/cn";

// Profile switcher for the persistent nav chrome, so switching doesn't
// require a trip to Settings. The switching logic itself (including the
// security-critical branch below) lives in useProfileSwitching, shared with
// ProfilesCard in settings-page.tsx; that component stays the canonical
// place to create/delete profiles, this one only switches between profiles
// that already exist.
//
// The trigger is pluggable: pass `children` to use them as the clickable
// element that opens the picker (sidebar-nav.tsx does this, wrapping the
// sidebar's own account card so the switcher reads as part of that card
// rather than a second, unrelated control bolted next to it). Omit
// `children` to fall back to the compact self-contained pill button below —
// used by the mobile top header (app-shell.tsx), which has no equivalent
// "account card" of its own to attach to.
export function ProfileSwitcher({ collapsed = false, children }: { collapsed?: boolean; children?: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const profiles = useProfiles();
  const { data: preferences } = usePreferences();
  const [open, setOpen] = useState(false);
  // See useProfileSwitching's own doc comment for why a free switcher here
  // is safe (only ever offered when auth isn't required, below).
  const { switchingProfileId, switchToProfile } = useProfileSwitching(() => setOpen(false));

  const activeProfileId = preferences?.activeProfileId;
  const currentProfile = profiles.data?.find((profile) => profile.id === activeProfileId);
  const currentLabel = currentProfile
    ? currentProfile.id === "default"
      ? t("settings.profiles.defaultName")
      : (currentProfile.name ?? t("settings.profiles.defaultName"))
    : t("settings.profiles.defaultName");

  const defaultTrigger = (
    <button
      type="button"
      aria-label={t("sidebar.switchProfile")}
      title={t("sidebar.switchProfile")}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.07] dark:border-white/5 bg-foreground/5 text-body-sm font-medium text-foreground transition-colors hover:bg-foreground/10",
        collapsed ? "h-8 w-8 justify-center" : "h-8 pl-1 pr-2.5"
      )}
    >
      <ProfileAvatar name={currentLabel} avatar={currentProfile?.avatar} className="size-6 text-caption" />
      {!collapsed && <span className="max-w-[6rem] truncate">{currentLabel}</span>}
      {!collapsed && <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </button>
  );

  // A failed profiles query already gets a full RemoteErrorState treatment
  // on the Settings page — this nav control just stays inert (rendering
  // whatever trigger it was given, un-wired to a picker it can't populate)
  // rather than showing broken/empty chrome on every screen. A custom
  // trigger is typically the sidebar's own account card, which still needs
  // to render for its unrelated sign-out button — only the switch-profile
  // behavior itself is dropped. The failure itself still gets logged
  // instead of disappearing silently.
  if (profiles.isError) {
    logger.warn(`ProfileSwitcher: failed to load profiles: ${String(profiles.error)}`);
    return children ? <>{children}</> : null;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children ?? defaultTrigger}</SheetTrigger>
      <SheetContent side="bottom" size="sm" closeLabel={t("common.close")}>
        <SheetTitle>{t("settings.profiles.title")}</SheetTitle>
        <SheetDescription>{t("settings.profiles.description")}</SheetDescription>

        <div className="mt-4 space-y-2 overflow-y-auto">
          {authConfig.required ? (
            // Access to a profile is derived from who is signed in (see
            // ProfileGate) — only the current profile is shown here, read-only,
            // exactly like ProfilesCard's own read-only branch.
            currentProfile ? (
              <Tile className="flex items-center gap-3 px-3 py-3">
                <ProfileAvatar name={currentLabel} avatar={currentProfile.avatar} className="size-8" />
                <div>
                  <p className="font-medium">{currentLabel}</p>
                  {user?.primaryEmailAddress?.emailAddress ? (
                    <p className="mt-1 text-body-sm text-muted-foreground">
                      {t("settings.profiles.linkedTo", { email: user.primaryEmailAddress.emailAddress })}
                    </p>
                  ) : null}
                </div>
              </Tile>
            ) : (
              <p className="text-body-sm text-muted-foreground">{t("settings.profiles.none")}</p>
            )
          ) : (
            (profiles.data ?? []).map((profile) => {
              const isActive = profile.id === activeProfileId;
              const label = profile.id === "default" ? t("settings.profiles.defaultName") : profile.name;
              return (
                <Tile key={profile.id} className="px-3 py-2.5">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 text-left text-body-sm font-medium disabled:cursor-default"
                    disabled={isActive || switchingProfileId !== null}
                    onClick={() => void switchToProfile(profile.id)}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <ProfileAvatar name={label ?? "?"} avatar={profile.avatar} className="size-7 text-caption" />
                      <span className="truncate">{label}</span>
                    </span>
                    {isActive ? (
                      <Badge variant="success" className="gap-1">
                        <Check className="size-3" aria-hidden="true" />
                        {t("settings.profiles.active")}
                      </Badge>
                    ) : null}
                  </button>
                </Tile>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
