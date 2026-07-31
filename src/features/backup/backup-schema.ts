import { z } from "zod";
import { preferencesSchema } from "@/features/preferences/preferences-repository";
import { browserStoreSchema } from "@/db/browser-store-schema";

// Field-level validation for a restored backup. The structural schemas live
// in src/db/browser-store-schema.ts (shared with the localStorage fallback
// store); backups additionally validate the preferences section against the
// strict preferences schema before anything is written into SQLite.

export const backupDataSchema = browserStoreSchema.extend({
  preferences: preferencesSchema.partial().optional(),
});

export const cineTrackBackupSchema = z.object({
  format: z.literal("cinetrack-backup"),
  version: z.literal(1),
  exportedAt: z.string(),
  data: backupDataSchema,
});
