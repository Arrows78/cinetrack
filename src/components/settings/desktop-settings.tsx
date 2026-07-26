import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { QUERY_CACHE_KEY } from "@/app/query-client";
import { Button } from "@/components/ui/button";
import { maintenanceService } from "@/services/maintenance-service";
import { tokenVault } from "@/services/token-vault";
import { updateService } from "@/services/update-service";
import { isTauriApp } from "@/shared/lib/platform";

export function DesktopSettings() {
  const [password, setPassword] = useState(""); const [token, setToken] = useState("");
  const [autoStart, setAutoStart] = useState(false); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (isTauriApp()) void isEnabled().then(setAutoStart).catch(() => undefined); }, []);
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setMessage(""); try { const result = await action(); setMessage(typeof result === "string" ? result : "Opération terminée."); } catch (error) { setMessage(error instanceof Error ? error.message : "Échec de l’opération."); } finally { setBusy(false); } };
  return <div className="space-y-6">
    <div><h3 className="font-semibold">Coffre TMDB</h3><p className="mt-1 text-sm text-muted-foreground">Le mot de passe n’est jamais enregistré. Il sert à dériver la clé du coffre local.</p><div className="mt-3 grid gap-2"><input className="h-10 rounded-xl border border-border bg-background px-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mot de passe du coffre" /><textarea className="min-h-24 rounded-xl border border-border bg-background p-3 text-sm" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Nouveau token Bearer TMDB" /><div className="flex gap-2"><Button disabled={busy || !password || !token.trim()} onClick={() => void run(() => tokenVault.save(password, token))}>Enregistrer</Button><Button variant="outline" disabled={busy || !password} onClick={() => void run(async () => (await tokenVault.unlock(password)) ? "Coffre déverrouillé." : "Coffre ouvert, mais aucun token enregistré.")}>Déverrouiller</Button><Button variant="ghost" onClick={() => tokenVault.lock()}>Verrouiller</Button></div></div></div>
    {isTauriApp() ? <div><h3 className="font-semibold">Intégration système</h3><div className="mt-3 flex flex-wrap gap-2"><Button variant={autoStart ? "secondary" : "outline"} disabled={busy} onClick={() => void run(async () => { if (autoStart) await disable(); else await enable(); setAutoStart(!autoStart); return !autoStart ? "Démarrage automatique activé." : "Démarrage automatique désactivé."; })}>{autoStart ? "Désactiver le démarrage automatique" : "Lancer au démarrage"}</Button><Button variant="outline" disabled={busy} onClick={() => void run(() => updateService.checkAndInstall())}>Rechercher une mise à jour</Button><Button variant="outline" disabled={busy} onClick={() => void run(async () => { const check = await maintenanceService.quickCheck(); return check.healthy ? `Base saine : ${check.detail}` : `Base endommagée : ${check.detail}`; })}>Vérifier la base</Button><Button variant="outline" disabled={busy} onClick={() => void run(async () => { await maintenanceService.createAutomaticBackup(true); return "Sauvegarde de secours actualisée."; })}>Sauvegarde de secours</Button><Button variant="outline" disabled={busy} onClick={() => void run(async () => { await maintenanceService.restoreAutomaticBackup(); window.localStorage.removeItem(QUERY_CACHE_KEY); window.location.reload(); })}>Restaurer la sauvegarde</Button></div></div> : null}
    {message ? <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm">{message}</p> : null}
    <p className="text-xs text-muted-foreground">Palette : Ctrl/Cmd+K dans la fenêtre, Ctrl/Cmd+Shift+K au niveau système. Liens : cinetrack://movie/123, cinetrack://series/123 et cinetrack://tonight.</p>
  </div>;
}
