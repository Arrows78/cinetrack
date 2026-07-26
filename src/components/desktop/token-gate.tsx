import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTokenVault } from "@/hooks/use-token-vault";
import { tokenVault } from "@/services/token-vault";
import { isTauriApp } from "@/shared/lib/platform";

export function TokenGate({ children }: { children: ReactNode }) {
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
      else if (!(await tokenVault.unlock(password))) setMessage("Aucun token n’est encore enregistré dans ce coffre.");
      if (!isTauriApp() && bearer.trim()) window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Impossible d’ouvrir le coffre."); }
    finally { setBusy(false); }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <form onSubmit={submit} className="w-full max-w-lg rounded-[32px] border border-border bg-card p-7 shadow-2xl">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><LockKeyhole className="size-6" /></div>
        <h1 className="mt-5 font-display text-3xl font-bold">Connecter CineTrack à TMDB</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Sur desktop, le token est chiffré dans Stronghold. Le mot de passe du coffre reste uniquement en mémoire pour cette session.</p>
        {isTauriApp() ? <input className="mt-6 h-11 w-full rounded-xl border border-border bg-background px-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mot de passe du coffre" required /> : null}
        <textarea className="mt-3 min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm" value={bearer} onChange={(event) => setBearer(event.target.value)} placeholder="Token Bearer TMDB — laissez vide pour déverrouiller un coffre existant" />
        {message ? <p className="mt-3 text-sm text-destructive">{message}</p> : null}
        <Button className="mt-5 w-full" type="submit" disabled={busy || (isTauriApp() && !password)}><KeyRound className="mr-2 size-4" />{bearer.trim() ? "Enregistrer et ouvrir" : "Déverrouiller"}</Button>
      </form>
    </main>
  );
}
