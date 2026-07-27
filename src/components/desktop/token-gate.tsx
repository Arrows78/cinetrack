import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTokenVault } from "@/features/desktop/use-token-vault";
import { tokenVault } from "@/features/desktop/token-vault";
import { isTauriApp } from "@/shared/lib/platform";

export function TokenGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const state = useTokenVault();
  const [password, setPassword] = useState("");
  const [bearer, setBearer] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void tokenVault.initialize(); }, []);

  if (state.unlocked && state.configured) return children;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (bearer.trim()) await tokenVault.save(password, bearer);
      else if (!(await tokenVault.unlock(password))) setMessage(t("tokenGate.noToken"));
      if (!isTauriApp() && bearer.trim()) window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : t("tokenGate.openFailed")); }
    finally { setBusy(false); }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-lg rounded-[32px] border border-border bg-card p-7 shadow-2xl">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><LockKeyhole className="size-6" /></div>
        <h1 className="mt-5 font-display text-3xl font-bold">{t("tokenGate.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("tokenGate.description")}</p>
        {isTauriApp() ? <input className="mt-6 h-11 w-full rounded-xl border border-border bg-background px-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("tokenGate.passwordPlaceholder")} required /> : null}
        <textarea className="mt-3 min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm" value={bearer} onChange={(event) => setBearer(event.target.value)} placeholder={t("tokenGate.tokenPlaceholder")} />
        {message ? <p className="mt-3 text-sm text-destructive">{message}</p> : null}
        <Button className="mt-5 w-full" type="submit" disabled={busy || (isTauriApp() && !password)}><KeyRound className="mr-2 size-4" />{bearer.trim() ? t("tokenGate.saveAndOpen") : t("tokenGate.unlock")}</Button>
      </form>
    </main>
  );
}
