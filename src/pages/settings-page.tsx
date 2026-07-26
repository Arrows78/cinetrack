import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DesktopSettings } from "@/components/settings/desktop-settings";
import { FilterBar } from "@/components/media/filter-bar";
import { SectionHeader } from "@/components/media/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePreferences } from "@/hooks/use-local-media";
import { COLOR_PRESETS, type AccentColor } from "@/shared/constants/colors";
import { cn } from "@/shared/lib/cn";

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { data: preferences, updatePreference, isSaving } = usePreferences();
  const setLanguage = async (language: "fr" | "en") => { await updatePreference({ key: "language", value: language }); await i18n.changeLanguage(language); };
  return <div className="space-y-6"><SectionHeader title={t("nav.settings")} subtitle="Interface, catalogue, confidentialité et intégration desktop." /><div className="grid gap-6 xl:grid-cols-2">
    <Card><CardHeader><CardTitle>{t("settings.uiPreferences")}</CardTitle><CardDescription>Personnalisez l’affichage et les valeurs par défaut.</CardDescription></CardHeader><CardContent className="space-y-6">
      <div><p className="mb-3 text-sm font-medium">Couleur d’accent</p><div className="flex flex-wrap gap-3">{(Object.entries(COLOR_PRESETS) as [AccentColor,(typeof COLOR_PRESETS)[AccentColor]][]).map(([key,preset]) => { const selected=(preferences?.accentColor ?? "violet")===key; return <button key={key} disabled={isSaving} onClick={() => updatePreference({key:"accentColor",value:key})} className="flex flex-col items-center gap-1.5 disabled:opacity-50"><div className={cn("flex size-9 items-center justify-center rounded-full",selected&&"ring-2 ring-offset-2 ring-offset-background")} style={{backgroundColor:preset.swatch,["--tw-ring-color" as string]:preset.swatch}}>{selected?<Check className="size-4 text-white"/>:null}</div><span className="text-[10px] text-muted-foreground">{preset.label}</span></button>; })}</div></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Langue<select className="h-10 rounded-xl border border-border bg-background px-3" value={preferences?.language ?? "fr"} onChange={(event) => void setLanguage(event.target.value as "fr"|"en")}><option value="fr">Français</option><option value="en">English</option></select></label><label className="grid gap-2 text-sm font-medium">Région TMDB<select className="h-10 rounded-xl border border-border bg-background px-3" value={preferences?.region ?? "FR"} onChange={(event) => void updatePreference({key:"region",value:event.target.value})}><option value="FR">France</option><option value="BE">Belgique</option><option value="CH">Suisse</option><option value="CA">Canada</option><option value="GB">Royaume-Uni</option><option value="US">États-Unis</option></select></label></div>
      <div><p className="mb-3 text-sm font-medium">Recherche par défaut</p><FilterBar value={preferences?.defaultSearchType ?? "all"} onChange={(value) => updatePreference({key:"defaultSearchType",value})} options={[{value:"all",label:"Tout"},{value:"series",label:"Séries"},{value:"movie",label:"Films"}]}/></div>
      <div className="flex flex-wrap gap-2"><Button variant={preferences?.reduceMotion?"secondary":"outline"} onClick={() => updatePreference({key:"reduceMotion",value:!preferences?.reduceMotion})}>Animations réduites</Button><Button variant={preferences?.compactMode?"secondary":"outline"} onClick={() => updatePreference({key:"compactMode",value:!preferences?.compactMode})}>Mode compact</Button><Button variant={preferences?.spoilerProtection?"secondary":"outline"} onClick={() => updatePreference({key:"spoilerProtection",value:!preferences?.spoilerProtection})}>Protection anti-spoiler</Button><Button variant={preferences?.notificationsEnabled?"secondary":"outline"} onClick={() => updatePreference({key:"notificationsEnabled",value:!preferences?.notificationsEnabled})}>Notifications calendrier</Button></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Desktop et sécurité</CardTitle><CardDescription>Token chiffré, raccourcis, démarrage, mises à jour et récupération.</CardDescription></CardHeader><CardContent><DesktopSettings /></CardContent></Card>
  </div></div>;
}
