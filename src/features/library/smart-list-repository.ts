import { invokeCommand } from "@/shared/lib/invoke";
import type { SmartList, SmartListRules } from "@/types/media";

// The name/rules validation and active-profile resolution now live in Rust
// (see src-tauri/src/commands/smart_lists.rs) — this repository is a thin
// invoke() wrapper, matching custom-list-repository.ts's own shape.
export const smartListRepository = {
  async list(): Promise<SmartList[]> {
    return invokeCommand<SmartList[]>("list_smart_lists");
  },

  async create(name: string, rules: SmartListRules): Promise<SmartList> {
    return invokeCommand<SmartList>("create_smart_list", { name, rules });
  },

  async update(smartListId: string, name: string, rules: SmartListRules): Promise<SmartList> {
    return invokeCommand<SmartList>("update_smart_list", { smartListId, name, rules });
  },

  async remove(smartListId: string): Promise<void> {
    await invokeCommand<void>("remove_smart_list", { smartListId });
  },
};
