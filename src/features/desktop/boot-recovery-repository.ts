import { bootRecoveryCommands, type BootRecovery } from "@/features/desktop/boot-recovery-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";

export type { BootRecovery } from "@/features/desktop/boot-recovery-commands";

// The Rust side quarantines a broken database file and starts fresh rather
// than crashing the process (see src-tauri/src/database/mod.rs::init_pool) —
// this is a thin invoke() wrapper around the flag it leaves behind.
export const bootRecoveryRepository = {
  async get(): Promise<BootRecovery> {
    return invokeTypedCommand(bootRecoveryCommands.get);
  },
};
