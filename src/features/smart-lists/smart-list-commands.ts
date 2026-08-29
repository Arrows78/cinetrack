import { defineCommand } from "@/shared/lib/invoke";
import type { SmartList, SmartListRules } from "@/types/media";

type CreateSmartListArgs = {
  name: string;
  rules: SmartListRules;
};

type UpdateSmartListArgs = CreateSmartListArgs & {
  smartListId: string;
};

type RemoveSmartListArgs = {
  smartListId: string;
};

export const smartListCommands = {
  list: defineCommand<undefined, SmartList[]>("list_smart_lists"),
  create: defineCommand<CreateSmartListArgs, SmartList>("create_smart_list"),
  update: defineCommand<UpdateSmartListArgs, SmartList>("update_smart_list"),
  remove: defineCommand<RemoveSmartListArgs, void>("remove_smart_list"),
} as const;
