import { invokeCommand } from "@/shared/lib/invoke";

export interface BootRecovery {
  recovered: boolean;
  quarantinedPath: string | null;
  originalError: string | null;
}

// The Rust side quarantines a broken database file and starts fresh rather
// than crashing the process (see src-tauri/src/database/mod.rs::init_pool) —
// this is a thin invoke() wrapper around the flag it leaves behind.
export const bootRecoveryRepository = {
  async get(): Promise<BootRecovery> {
    return invokeCommand<BootRecovery>("get_boot_recovery");
  },
};
