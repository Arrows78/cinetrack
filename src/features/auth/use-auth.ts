import { createContext, useContext } from "react";
import type { SignedInSessionResource, UserResource } from "@clerk/react/types";

import type { SocialAuthProvider } from "@/features/auth/auth-client";

export type AuthStatus = "loading" | "ready";

export interface EmailOtpRequest {
  email: string;
  marketingOptIn: boolean;
  shouldCreateUser: boolean;
}

export interface EmailOtpVerification {
  email: string;
  token: string;
}

export interface AuthContextValue {
  configured: boolean;
  required: boolean;
  status: AuthStatus;
  session: SignedInSessionResource | null;
  user: UserResource | null;
  error: string | null;
  // Raw error code/message behind an unrecognized `error` — only set when
  // `error` itself fell back to the generic translated message, so a user
  // hitting that case can copy something actionable to report rather than
  // just "Something went wrong." `null` for every error case this feature
  // already recognizes and gives a specific translated message for.
  errorDetail: string | null;
  clearError: () => void;
  signInWithProvider: (provider: SocialAuthProvider) => Promise<void>;
  requestEmailOtp: (request: EmailOtpRequest) => Promise<void>;
  verifyEmailOtp: (verification: EmailOtpVerification) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
