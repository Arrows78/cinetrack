import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";

import { AuthStage } from "@/features/auth/atoms/auth-stage";
import { AuthTextField } from "@/features/auth/atoms/auth-text-field";
import { useAuth } from "@/features/auth/use-auth";
import { Button } from "@/components/ui/button";
import { useCreateProfileForSupabaseUser } from "@/features/profiles/use-profiles";

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
    <AuthStage>
      <h1 className="text-heading-lg font-bold tracking-tight">{t("profileGate.createTitle")}</h1>
      <p className="mt-2 text-body-sm leading-6 text-auth-foreground/55">
        {t("profileGate.createDescription", { email: user?.primaryEmailAddress?.emailAddress ?? "" })}
      </p>

      <form className="mt-7" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-body-sm font-medium text-auth-foreground/70">
            {t("profileGate.nameLabel")}
          </span>
          <AuthTextField
            icon={UserPlus}
            // This screen's sole field: autofocusing it is the expected
            // behavior for a single-field auth step, not a distraction.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("profileGate.namePlaceholder")}
            maxLength={60}
          />
        </label>

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
          className="mt-5 rounded-2xl border border-auth-destructive/25 bg-auth-destructive/10 px-4 py-3 text-body-sm text-auth-foreground/90"
        >
          {t("profileGate.createError")}
        </p>
      ) : null}

      <button
        type="button"
        className="mt-6 text-body-sm text-auth-foreground/60 underline-offset-4 hover:text-auth-foreground hover:underline"
        onClick={() => void signOut()}
      >
        {t("profileGate.signOut")}
      </button>
    </AuthStage>
  );
}
