import { smartListCommands } from "@/features/library/smart-list-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { SmartList, SmartListRules } from "@/types/media";

// The name/rules validation and active-profile resolution now live in Rust
// (see src-tauri/src/lists/smart/) — this repository is a thin
// invoke() wrapper, matching custom-list-repository.ts's own shape.
export const smartListRepository = {
  async list(): Promise<SmartList[]> {
    return invokeTypedCommand(smartListCommands.list);
  },

  async create(name: string, rules: SmartListRules): Promise<SmartList> {
    return invokeTypedCommand(smartListCommands.create, { name, rules });
  },

  async update(smartListId: string, name: string, rules: SmartListRules): Promise<SmartList> {
    return invokeTypedCommand(smartListCommands.update, { smartListId, name, rules });
  },

  async remove(smartListId: string): Promise<void> {
    await invokeTypedCommand(smartListCommands.remove, { smartListId });
  },
};
