import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { useCreateProfileForSupabaseUser } from "@/features/collections/use-collections";

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
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="surface w-full max-w-xl rounded-shell p-8">
        <UserPlus className="h-10 w-10 text-primary" />
        <h1 className="mt-5 text-2xl font-bold">{t("profileGate.createTitle")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("profileGate.createDescription", { email: user?.email ?? "" })}
        </p>
        <form className="mt-6 flex gap-2" onSubmit={handleSubmit}>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("profileGate.namePlaceholder")}
            aria-label={t("profileGate.nameLabel")}
            maxLength={60}
          />
          <Button type="submit" disabled={!name.trim() || isSaving}>
            {t("profileGate.createSubmit")}
          </Button>
        </form>
        {error ? <p className="mt-3 text-sm text-destructive">{t("profileGate.createError")}</p> : null}
        <button
          type="button"
          className="mt-6 text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => void signOut()}
        >
          {t("profileGate.signOut")}
        </button>
      </div>
    </div>
  );
}
