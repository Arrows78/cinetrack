import { LoaderCircle } from "lucide-react";

export function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/80 px-5 py-4 text-sm text-muted-foreground shadow-xl">
        <LoaderCircle className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}
