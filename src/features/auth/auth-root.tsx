import type { PropsWithChildren } from "react";
import { ClerkAppProvider } from "@/features/auth/clerk-app-provider";
import { AuthGate } from "@/features/auth/auth-gate";
import { AuthProvider } from "@/features/auth/auth-provider";
import { ProfileGate } from "@/features/auth/profile-gate";
import { OnboardingGate } from "@/features/onboarding";

export function AuthRoot({ children }: PropsWithChildren) {
  return (
    <ClerkAppProvider>
      <AuthProvider>
        <AuthGate>
          <ProfileGate>
            <OnboardingGate>{children}</OnboardingGate>
          </ProfileGate>
        </AuthGate>
      </AuthProvider>
    </ClerkAppProvider>
  );
}
