import { useSyncExternalStore } from "react";
import { tokenVault } from "@/features/desktop/token-vault";
export const useTokenVault = () =>
  useSyncExternalStore(tokenVault.subscribe, tokenVault.getSnapshot, tokenVault.getSnapshot);
