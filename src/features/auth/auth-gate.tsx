import type { PropsWithChildren } from "react";
import { LoaderCircle, Settings2 } from "lucide-react";
import { AuthScreen } from "@/features/auth/auth-screen";
import { useAuth } from "@/features/auth/auth-context";

export function AuthGate({ children }: PropsWithChildren) {
  const { configured, required, session, status } = useAuth();

  if (!required) return children;

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/80 px-5 py-4 text-sm text-muted-foreground shadow-xl">
          <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
          Restoring your session…
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="surface max-w-xl rounded-[32px] p-8">
          <Settings2 className="h-10 w-10 text-primary" />
          <h1 className="mt-5 text-2xl font-bold">Authentication needs configuration</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to your .env file, or set{" "}
            <code>VITE_AUTH_REQUIRED=false</code> to keep CineTrack in local-only mode.
          </p>
        </div>
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  return children;
}
