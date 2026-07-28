import { useEffect, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";

import { authConfig } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-context";
import { CreateProfileScreen } from "@/features/auth/create-profile-screen";
import { useProfileForSupabaseUser } from "@/features/collections/use-collections";
import { usePreferences } from "@/features/preferences/use-preferences";
import { preferencesRepository } from "@/features/preferences/preferences-repository";

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/80 px-5 py-4 text-sm text-muted-foreground shadow-xl">
        <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
        {label}
      </div>
    </div>
  );
}

// Which local profile is active is derived from who is signed in, not
// picked freely — accessing a profile now requires being the Supabase
// account it's linked to. AuthGate already blocks everything here until a
// session exists whenever auth is required, so this only has real work to
// do in that case.
export function ProfileGate({ children }: PropsWithChildren) {
  const { session } = useAuth();

  if (!authConfig.required) return children;
  if (!session) return children;

  return <ResolvedProfileGate supabaseUserId={session.user.id}>{children}</ResolvedProfileGate>;
}

function ResolvedProfileGate({ supabaseUserId, children }: PropsWithChildren<{ supabaseUserId: string }>) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const profileQuery = useProfileForSupabaseUser(supabaseUserId);
  const preferencesQuery = usePreferences();

  const resolvedProfileId = profileQuery.data?.id;
  const activeProfileId = preferencesQuery.data?.activeProfileId;

  useEffect(() => {
    if (!resolvedProfileId || activeProfileId === resolvedProfileId) return;

    let cancelled = false;
    void preferencesRepository.updatePreference("activeProfileId", resolvedProfileId).then(() => {
      if (!cancelled) void queryClient.invalidateQueries({ queryKey: ["local"] });
    });

    return () => {
      cancelled = true;
    };
  }, [resolvedProfileId, activeProfileId, queryClient]);

  if (profileQuery.isLoading || preferencesQuery.isLoading) {
    return <LoadingScreen label={t("profileGate.resolving")} />;
  }

  if (!profileQuery.data) {
    return <CreateProfileScreen supabaseUserId={supabaseUserId} />;
  }

  if (activeProfileId !== resolvedProfileId) {
    // The preference write above is still in flight — avoid a one-tick
    // flash of the app against the previous profile's data.
    return <LoadingScreen label={t("profileGate.resolving")} />;
  }

  return children;
}
