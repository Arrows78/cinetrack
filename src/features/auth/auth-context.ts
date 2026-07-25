import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

import type { SocialAuthProvider } from "@/features/auth/auth-client";

export type AuthStatus = "loading" | "ready";

export interface EmailOtpRequest {
  email: string;
  createUser: boolean;
  marketingOptIn: boolean;
}

export interface EmailOtpVerification {
  email: string;
  token: string;
}

export interface AuthContextValue {
  configured: boolean;
  required: boolean;
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  error: string | null;
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
