import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tile } from "@/components/ui/tile";
import { toast } from "@/components/ui/use-toast";
import { authConfig } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-context";
import { logger } from "@/features/diagnostics/logger";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useProfiles } from "@/features/profiles/use-profiles";
import { cn } from "@/shared/lib/cn";

function profileInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "?";
}

// Profile switcher for the persistent nav chrome, so switching doesn't
// require a trip to Settings. The switching logic itself — including the
// security-critical branch below — is copied faithfully from ProfilesCard in
// settings-page.tsx; that component stays the canonical place to
// create/delete profiles, this one only switches between profiles that
// already exist.
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
  const queryClient = useQueryClient();
  const profiles = useProfiles();
  const { data: preferences } = usePreferences();
  const [open, setOpen] = useState(false);
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null);

  const activeProfileId = preferences?.activeProfileId;
  const currentProfile = profiles.data?.find((profile) => profile.id === activeProfileId);
  const currentLabel = currentProfile
    ? currentProfile.id === "default"
      ? t("settings.profiles.defaultName")
      : (currentProfile.name ?? t("settings.profiles.defaultName"))
    : t("settings.profiles.defaultName");

  // Only ever offered when auth isn't required — see ProfilesCard's own
  // comment on this exact branch for why a free switcher is otherwise a
  // security hole once Supabase sign-in is in play. set_active_profile
  // itself also refuses to switch into a profile linked to a Supabase
  // account without proof of that account, so this stays safe even if this
  // control were somehow reachable while auth is required.
  const switchToProfile = async (profileId: string) => {
    setSwitchingProfileId(profileId);
    try {
      await preferencesRepository.setActiveProfile(profileId);
      queryClient.removeQueries({ queryKey: ["local"] });
      setOpen(false);
    } catch {
      toast({ description: t("settings.profiles.switchFailed"), variant: "error" });
    } finally {
      setSwitchingProfileId(null);
    }
  };

  const defaultTrigger = (
    <button
      type="button"
      aria-label={t("sidebar.switchProfile")}
      title={t("sidebar.switchProfile")}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.07] dark:border-white/5 bg-foreground/5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/10",
        collapsed ? "h-8 w-8 justify-center" : "h-8 pl-1 pr-2.5"
      )}
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
        {profileInitial(currentLabel)}
      </span>
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
              <Tile className="px-3 py-3">
                <p className="font-medium">{currentLabel}</p>
                {user?.email ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("settings.profiles.linkedTo", { email: user.email })}
                  </p>
                ) : null}
              </Tile>
            ) : (
              <p className="text-sm text-muted-foreground">{t("settings.profiles.none")}</p>
            )
          ) : (
            (profiles.data ?? []).map((profile) => {
              const isActive = profile.id === activeProfileId;
              const label = profile.id === "default" ? t("settings.profiles.defaultName") : profile.name;
              return (
                <Tile key={profile.id} className="px-3 py-2.5">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 text-left text-sm font-medium disabled:cursor-default"
                    disabled={isActive || switchingProfileId !== null}
                    onClick={() => void switchToProfile(profile.id)}
                  >
                    <span className="truncate">{label}</span>
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
