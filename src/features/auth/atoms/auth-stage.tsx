import type { PropsWithChildren } from "react";

import { AuthBackdrop } from "@/features/auth/atoms/auth-backdrop";
import { AuthPanel } from "@/features/auth/atoms/auth-panel";

export function AuthStage({ children }: PropsWithChildren) {
  return (
    <div className="relative flex min-h-screen flex-col bg-auth-background text-auth-foreground lg:flex-row">
      <div className="relative order-1 min-h-56 flex-1 sm:min-h-72 lg:h-auto lg:w-2/3 lg:flex-none">
        <AuthBackdrop />
      </div>
      <AuthPanel>{children}</AuthPanel>
    </div>
  );
}
