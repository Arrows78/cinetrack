import { defineCommand } from "@/shared/lib/invoke";
import type { DismissedRecommendation, MediaType } from "@/types/media";

export interface DismissMediaInput {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
}

type DismissRecommendationArgs = {
  media: DismissMediaInput;
};

type UndismissRecommendationArgs = {
  mediaId: number;
  mediaType: MediaType;
};

export const recommendationsCommands = {
  list: defineCommand<undefined, DismissedRecommendation[]>("list_dismissed_recommendations"),
  dismiss: defineCommand<DismissRecommendationArgs, void>("dismiss_recommendation"),
  undismiss: defineCommand<UndismissRecommendationArgs, void>("undismiss_recommendation"),
} as const;
