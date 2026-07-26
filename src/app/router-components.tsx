import type { ErrorComponentProps } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell";

export function RootLayout() {
  return <AppShell />;
}

export function PendingComponent() {
  return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
}

export function ErrorComponent({ error }: ErrorComponentProps) {
  return (
    <div className="surface rounded-[32px] p-6">
      <h2 className="text-xl font-semibold">Something went wrong</h2>

      <p className="mt-3 text-sm text-muted-foreground">{error.message}</p>
    </div>
  );
}
