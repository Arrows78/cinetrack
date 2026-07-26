import { useEffect } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { AppRouter } from "@/app/router";
import { queryClient,queryPersister } from "@/app/query-client";
import { OfflineIndicator } from "@/components/layout/offline-indicator";
import { ThemeController } from "@/components/layout/theme-controller";
import { availabilityMonitor } from "@/services/availability-monitor";
import { initializeDatabase } from "@/services/local/db";
export function App(){useEffect(()=>{void initializeDatabase().then(()=>availabilityMonitor.checkAll()).catch((error)=>console.warn("Database initialization fallback engaged:",error));const interval=window.setInterval(()=>void availabilityMonitor.checkAll(),1000*60*60*6);return()=>window.clearInterval(interval);},[]);return <PersistQueryClientProvider client={queryClient} persistOptions={{persister:queryPersister,maxAge:1000*60*60*24*7,buster:"cinetrack-v1"}}><ThemeController/><AppRouter/><OfflineIndicator/>{import.meta.env.DEV?<ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left"/>:null}</PersistQueryClientProvider>;}
