import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { WifiOff } from "lucide-react";
export function OfflineIndicator() { const { t } = useTranslation(); const [online,setOnline]=useState(navigator.onLine); useEffect(()=>{const on=()=>setOnline(true);const off=()=>setOnline(false);window.addEventListener("online",on);window.addEventListener("offline",off);return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};},[]); if(online)return null; return <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-500/30 bg-background px-4 py-2 text-sm shadow-xl"><WifiOff className="size-4 text-amber-500"/>{t("offline.message")}</div>; }
