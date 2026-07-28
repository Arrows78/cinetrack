import type { PropsWithChildren } from "react";
import { AuthGate } from "@/features/auth/auth-gate";
import { AuthProvider } from "@/features/auth/auth-provider";
import { ProfileGate } from "@/features/auth/profile-gate";

export function AuthRoot({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <AuthGate>
        <ProfileGate>{children}</ProfileGate>
      </AuthGate>
    </AuthProvider>
  );
}
