import type { PropsWithChildren } from "react";
import { LogOut, UserRound } from "lucide-react";
import { AuthGate } from "@/features/auth/auth-gate";
import { AuthProvider } from "@/features/auth/auth-provider";
import { useAuth } from "@/features/auth/auth-context";

function AccountControl() {
  const { session, signOut, user } = useAuth();

  if (!session) return null;

  const label =
    user?.user_metadata.full_name ??
    user?.user_metadata.name ??
    user?.email ??
    "Account";

  return (
    <div className="fixed right-4 top-4 z-[100] flex max-w-[min(22rem,calc(100vw-2rem))] items-center gap-2 rounded-2xl border border-border bg-background/90 p-2 shadow-xl backdrop-blur">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <UserRound className="h-4 w-4" />
      </div>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{label}</span>
      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        onClick={() => void signOut()}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AuthRoot({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <AuthGate>
        {children}
        <AccountControl />
      </AuthGate>
    </AuthProvider>
  );
}
