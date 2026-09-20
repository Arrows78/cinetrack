import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "@clerk/react";
import { Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/features/auth/use-auth";
import { logger } from "@/shared/lib/logger";
import type { TFunction } from "i18next";

interface ClerkErrorLike {
  status?: number;
  errors?: Array<{ code?: string; message?: string }>;
}

// Mirrors auth-provider.tsx's own describeError — kept separate (rather than
// exported and shared) because that one's messages are tuned for the
// pre-app sign-in screen's copy, and this module needs its own settings-page
// tone plus a couple of codes (form_identifier_exists) that mean something
// different here (changing to an email already in use) than they do there.
function describeAccountError(t: TFunction, error: unknown): string {
  const clerkError = error as ClerkErrorLike;
  const code = clerkError?.errors?.[0]?.code;

  if (clerkError?.status === 429 || code === "too_many_requests") {
    return t("settings.account.errors.rateLimited");
  }
  if (code === "verification_expired") {
    return t("settings.account.errors.codeExpired");
  }
  if (code === "form_code_incorrect") {
    return t("settings.account.errors.codeIncorrect");
  }
  if (code === "form_param_format_invalid") {
    return t("settings.account.errors.invalidEmail");
  }
  if (code === "form_identifier_exists") {
    return t("settings.account.errors.emailExists");
  }

  const raw = clerkError?.errors?.[0]?.message ?? (error instanceof Error ? error.message : String(error));
  logger.warn(`Account settings error: ${raw}`);
  return t("settings.account.errors.default");
}

type EmailStep = "idle" | "verify";

/**
 * Email change + account deletion, both against Clerk directly (this app's
 * auth provider — see docs/auth.md) rather than any Rust command. No
 * password-change control: this Clerk instance only offers email-code and
 * OAuth sign-in (see provider-availability.ts / auth-provider.tsx), never
 * password, so there is no password to change.
 */
export function AccountSettingsCard() {
  const { t } = useTranslation();
  const { user } = useUser();
  const { signOut } = useAuth();

  const [step, setStep] = useState<EmailStep>("idle");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [pendingEmailId, setPendingEmailId] = useState<string | null>(null);
  const [previousPrimaryEmailId, setPreviousPrimaryEmailId] = useState<string | null>(null);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!user) return null;

  const currentEmail = user.primaryEmailAddress?.emailAddress ?? null;

  const requestEmailChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(null);
    setIsSubmittingEmail(true);
    try {
      const trimmed = newEmail.trim().toLowerCase();
      const emailAddress = await user.createEmailAddress({ email: trimmed });
      await emailAddress.prepareVerification({ strategy: "email_code" });
      setPendingEmailId(emailAddress.id);
      setPreviousPrimaryEmailId(user.primaryEmailAddressId ?? null);
      setStep("verify");
    } catch (error) {
      setEmailError(describeAccountError(t, error));
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const confirmEmailChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingEmailId) return;
    setEmailError(null);
    setIsSubmittingEmail(true);
    try {
      const pendingAddress = user.emailAddresses.find((address) => address.id === pendingEmailId);
      if (!pendingAddress) throw new Error("Pending email address is no longer on the user.");
      const verified = await pendingAddress.attemptVerification({ code: code.trim() });
      await user.update({ primaryEmailAddressId: verified.id });

      // Best-effort cleanup: drop the old address so the account doesn't
      // silently accumulate stale, unused emails. Never blocks the
      // already-successful change above on failure.
      if (previousPrimaryEmailId) {
        const previous = user.emailAddresses.find((address) => address.id === previousPrimaryEmailId);
        try {
          await previous?.destroy();
        } catch (cleanupError) {
          logger.warn(
            `Failed to remove the previous email address after change: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
          );
        }
      }

      toast({ description: t("settings.account.emailUpdated"), variant: "success" });
      setStep("idle");
      setNewEmail("");
      setCode("");
      setPendingEmailId(null);
      setPreviousPrimaryEmailId(null);
    } catch (error) {
      setEmailError(describeAccountError(t, error));
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const cancelEmailChange = () => {
    setStep("idle");
    setCode("");
    setEmailError(null);
    setPendingEmailId(null);
    setPreviousPrimaryEmailId(null);
  };

  const deleteAccount = async () => {
    setIsDeleting(true);
    try {
      await user.delete();
      await signOut();
    } catch (error) {
      logger.error(`Account deletion failed: ${error instanceof Error ? error.message : String(error)}`);
      toast({ description: describeAccountError(t, error), variant: "error" });
      setIsDeleting(false);
      setPendingDelete(false);
      return;
    }
    setIsDeleting(false);
    setPendingDelete(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.account.title")}</CardTitle>
        <CardDescription>{t("settings.account.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="text-body-sm font-medium">{t("settings.account.emailTitle")}</p>
          {currentEmail ? (
            <p className="mt-1 text-body-sm text-muted-foreground">
              {t("settings.account.currentEmail", { email: currentEmail })}
            </p>
          ) : null}

          {step === "idle" ? (
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => void requestEmailChange(event)}>
              <label className="grid min-w-[200px] flex-1 gap-2 text-body-sm font-medium">
                {t("settings.account.newEmailLabel")}
                <Input
                  size="sm"
                  type="email"
                  required
                  autoComplete="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  aria-label={t("settings.account.newEmailLabel")}
                />
              </label>
              <Button
                type="submit"
                variant="outline"
                isLoading={isSubmittingEmail}
                disabled={!newEmail.trim() || isSubmittingEmail}
              >
                <Mail className="mr-2 size-4" />
                {t("settings.account.sendCode")}
              </Button>
            </form>
          ) : (
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => void confirmEmailChange(event)}>
              <label className="grid min-w-[160px] flex-1 gap-2 text-body-sm font-medium">
                {t("settings.account.codeLabel", { email: newEmail.trim() })}
                <Input
                  size="sm"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  aria-label={t("settings.account.codeLabel", { email: newEmail.trim() })}
                />
              </label>
              <Button
                type="submit"
                variant="outline"
                isLoading={isSubmittingEmail}
                disabled={!code.trim() || isSubmittingEmail}
              >
                {t("settings.account.verifyCode")}
              </Button>
              <Button type="button" variant="ghost" disabled={isSubmittingEmail} onClick={cancelEmailChange}>
                {t("common.cancel")}
              </Button>
            </form>
          )}
          {emailError ? (
            <p role="alert" className="mt-2 text-body-sm text-destructive">
              {emailError}
            </p>
          ) : null}
        </div>

        {user.deleteSelfEnabled ? (
          <div className="border-t border-border pt-6">
            <p className="text-body-sm font-medium">{t("settings.account.dangerTitle")}</p>
            <p className="mt-1 text-caption text-muted-foreground">{t("settings.account.dangerDescription")}</p>
            <Button type="button" variant="destructive" className="mt-3" onClick={() => setPendingDelete(true)}>
              <Trash2 className="mr-2 size-4" />
              {t("settings.account.deleteAccount")}
            </Button>
          </div>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={pendingDelete}
        onOpenChange={(open) => !open && !isDeleting && setPendingDelete(false)}
        title={t("settings.account.deleteConfirmTitle")}
        description={t("settings.account.deleteConfirmDescription")}
        confirmLabel={t("settings.account.deleteAccount")}
        cancelLabel={t("common.cancel")}
        isConfirming={isDeleting}
        onConfirm={() => void deleteAccount()}
      />
    </Card>
  );
}
