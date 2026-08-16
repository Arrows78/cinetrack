import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";

import { AuthBackdrop } from "@/features/auth/auth-backdrop";
import { AuthBrandMark } from "@/features/auth/auth-brand-mark";
import { AuthStepIcon } from "@/features/auth/auth-step-icon";
import { AuthTextField } from "@/features/auth/auth-text-field";
import { useAuth } from "@/features/auth/auth-context";
import { Button } from "@/components/ui/button";
import { useCreateProfileForSupabaseUser } from "@/features/profiles/use-profiles";

// Shares AuthScreen's split stage/panel layout and input treatment (see
// auth-email-step.tsx for the same underline-field/pill-button pattern) —
// this is the very next screen after sign-up, and a plain, neutral card
// here used to break the cinematic scene AuthScreen had just set.
export function CreateProfileScreen({ supabaseUserId }: { supabaseUserId: string }) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { create, isSaving, error } = useCreateProfileForSupabaseUser();
  const [name, setName] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    void create({ name, supabaseUserId });
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-black text-auth-foreground lg:flex-row">
      <div className="relative order-1 min-h-56 flex-1 sm:min-h-72 lg:h-auto lg:w-2/3 lg:flex-none">
        <AuthBackdrop />
      </div>

      <div className="relative z-10 order-2 flex shrink-0 flex-col justify-start bg-auth-surface px-5 py-8 sm:px-8 lg:w-1/3 lg:flex-none lg:justify-center lg:px-10">
        <div className="mb-7">
          <AuthBrandMark />
        </div>

        <AuthStepIcon icon={UserPlus} />
        <h1 className="mt-5 text-2xl font-black">{t("profileGate.createTitle")}</h1>
        <p className="mt-3 text-sm leading-6 text-auth-foreground/55">
          {t("profileGate.createDescription", { email: user?.email ?? "" })}
        </p>

        <form className="mt-7" onSubmit={handleSubmit}>
          <AuthTextField
            icon={UserPlus}
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("profileGate.namePlaceholder")}
            aria-label={t("profileGate.nameLabel")}
            maxLength={60}
          />

          <Button
            type="submit"
            variant="authPrimary"
            size="auth"
            className="mt-7"
            disabled={!name.trim() || isSaving}
            isLoading={isSaving}
          >
            {t("profileGate.createSubmit")}
          </Button>
        </form>

        {error ? (
          <p
            role="alert"
            aria-live="polite"
            className="mt-5 rounded-2xl border border-auth-destructive/25 bg-auth-destructive/10 px-4 py-3 text-sm text-auth-foreground/90"
          >
            {t("profileGate.createError")}
          </p>
        ) : null}

        <button
          type="button"
          className="mt-6 text-sm text-auth-foreground/60 underline-offset-4 hover:text-auth-foreground hover:underline"
          onClick={() => void signOut()}
        >
          {t("profileGate.signOut")}
        </button>
      </div>
    </div>
  );
}
