import { defineCommand } from "@/shared/lib/invoke";
import type { ViewingHistoryItem } from "@/types/media";

type ListHistoryArgs = {
  limit: number | undefined;
  beforeTimestamp: string | undefined;
  beforeId: string | undefined;
};

export const historyCommands = {
  list: defineCommand<ListHistoryArgs, ViewingHistoryItem[]>("list_history"),
} as const;
