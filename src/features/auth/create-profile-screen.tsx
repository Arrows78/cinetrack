import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, UserPlus } from "lucide-react";

import { AuthStage } from "@/features/auth/atoms/auth-stage";
import { AuthTextField } from "@/features/auth/atoms/auth-text-field";
import { useAuth } from "@/features/auth/use-auth";
import { Button } from "@/components/ui/button";
import { useCreateProfileForSupabaseUser } from "@/features/profiles/use-profiles";
import { AVATAR_PRESETS, type AvatarPresetKey } from "@/shared/constants/colors";
import { cn } from "@/shared/lib/cn";

export function CreateProfileScreen({ supabaseUserId }: { supabaseUserId: string }) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { create, isSaving, error } = useCreateProfileForSupabaseUser();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<AvatarPresetKey | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    void create({ name, supabaseUserId, avatar });
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

        <div className="mt-6">
          <p className="mb-3 text-body-sm font-medium text-auth-foreground/80">{t("profileGate.avatarLabel")}</p>
          <div className="flex flex-wrap gap-3">
            {(Object.entries(AVATAR_PRESETS) as [AvatarPresetKey, (typeof AVATAR_PRESETS)[AvatarPresetKey]][]).map(
              ([key, preset]) => {
                const selected = avatar === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    aria-label={t(`avatars.${key}`)}
                    onClick={() => setAvatar(selected ? null : key)}
                    className="relative flex size-11 items-center justify-center rounded-full text-lg"
                  >
                    <span
                      className={cn(
                        "flex size-full items-center justify-center rounded-full",
                        selected && "ring-2 ring-offset-2 ring-offset-auth-surface"
                      )}
                      style={{ backgroundColor: preset.swatch, ["--tw-ring-color" as string]: preset.swatch }}
                    >
                      <span aria-hidden="true">{preset.emoji}</span>
                    </span>
                    {selected ? (
                      <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-auth-foreground text-auth-surface">
                        <Check className="size-2.5" aria-hidden="true" />
                      </span>
                    ) : null}
                  </button>
                );
              }
            )}
          </div>
        </div>

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
