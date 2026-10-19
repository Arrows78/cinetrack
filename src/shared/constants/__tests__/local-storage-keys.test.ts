import { describe, expect, it } from "vitest";
import * as registry from "@/shared/constants/local-storage-keys";

const staticKeys = Object.entries(registry).filter(([, value]) => typeof value === "string") as [string, string][];

describe("local-storage-keys registry", () => {
  it("only declares cinetrack.* keys", () => {
    for (const [name, value] of staticKeys) {
      expect(value, name).toMatch(/^cinetrack\./);
    }
  });

  it("has no duplicate key values", () => {
    const values = staticKeys.map(([, value]) => value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("keeps the historical string of every static key", () => {
    expect(Object.fromEntries(staticKeys)).toEqual({
      BROWSER_TOKEN_KEY: "cinetrack.tmdb-token",
      LANGUAGE_STORAGE_KEY: "cinetrack.language",
      AUTH_SESSION_STORAGE_KEY: "cinetrack.auth.session",
      LEGACY_QUERY_CACHE_KEY: "cinetrack.query-cache.v1",
      ON_THIS_DAY_INVITE_DISMISSED_KEY: "cinetrack.on-this-day-invite-dismissed-at",
      CLERK_CLIENT_JWT_STORAGE_KEY: "cinetrack.clerk.clientJwt",
      REMOTE_QUERY_CACHE_KEY: "cinetrack.remote-cache.v1",
      IMAGE_CACHE_META_KEY: "cinetrack.image-cache.meta.v1",
      LAST_AUTO_BACKUP_KEY: "cinetrack.last-auto-backup",
      LAST_AUTO_BACKUP_FAILED_KEY: "cinetrack.last-auto-backup-failed",
    });
  });

  it("keeps the historical shape of parameterised keys", () => {
    expect(registry.sentNotificationsKey("profile-1")).toBe("cinetrack.sent-notifications.v2:profile-1");
    expect(registry.availabilityBaselineKey("alert-1")).toBe("cinetrack.availability-baseline.v1:alert-1");
  });
});
