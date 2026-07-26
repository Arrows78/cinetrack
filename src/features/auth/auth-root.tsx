import type { PropsWithChildren } from "react";
import { AuthGate } from "@/features/auth/auth-gate";
import { AuthProvider } from "@/features/auth/auth-provider";

export function AuthRoot({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <AuthGate>
        {children}
      </AuthGate>
    </AuthProvider>
  );
}
