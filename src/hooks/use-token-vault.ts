import { useSyncExternalStore } from "react";
import { tokenVault } from "@/services/token-vault";
export const useTokenVault = () => useSyncExternalStore(tokenVault.subscribe, tokenVault.getSnapshot, tokenVault.getSnapshot);
