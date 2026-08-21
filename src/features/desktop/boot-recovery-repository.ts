import { invokeCommand } from "@/shared/lib/invoke";

export interface BootRecovery {
  recovered: boolean;
  // Set by the Rust side when a migration statement failed (the database
  // file is untouched, at a valid prior schema version — see
  // src-tauri/src/database/mod.rs::init_pool_at), or written directly into
  // this query's cache by App.tsx when the post-boot `PRAGMA quick_check`
  // comes back unhealthy. Either way: no "continue anyway" escape hatch,
  // unlike `recovered`.
  blocked: boolean;
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
