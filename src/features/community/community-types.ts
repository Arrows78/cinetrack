export type CommunityVisibility = "followers" | "public";

export type CommunityProfile = {
  userId: string;
  handle: string;
  displayName: string;
  avatarPath: string | null;
  bio: string | null;
  isPrivate: boolean;
  activityVisibility: "private" | "followers" | "public";
  createdAt: string;
  updatedAt: string;
};

export type CommunityReview = {
  id: string;
  userId: string;
  mediaType: "movie" | "series";
  mediaId: number;
  rating: number | null;
  body: string;
  containsSpoilers: boolean;
  visibility: CommunityVisibility;
  createdAt: string;
  updatedAt: string;
};

export type CommunityComment = {
  id: string;
  reviewId: string;
  userId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type CommunityActivity = {
  id: string;
  userId: string;
  activityType: "media_completed" | "review_published" | "list_published" | "milestone";
  mediaType: "movie" | "series" | null;
  mediaId: number | null;
  objectId: string | null;
  visibility: CommunityVisibility;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type CommunityNotification = {
  id: string;
  userId: string;
  actorId: string | null;
  notificationType: "follow" | "follow_request" | "review_like" | "comment";
  objectId: string | null;
  createdAt: string;
  readAt: string | null;
};

export type CommunityProfileInput = {
  handle: string;
  displayName: string;
  avatarPath?: string | null;
  bio?: string | null;
  isPrivate?: boolean;
  activityVisibility?: "private" | "followers" | "public";
};

export type PublishReviewInput = {
  mediaType: "movie" | "series";
  mediaId: number;
  rating?: number | null;
  body: string;
  containsSpoilers?: boolean;
  visibility?: CommunityVisibility;
};
