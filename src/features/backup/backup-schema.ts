import { z } from "zod";
import { preferencesSchema } from "@/features/preferences/preferences-repository";
import { portableDataSchema } from "./portable-data-schema";

// Field-level validation for a restored backup. The structural schemas live
// in ./portable-data-schema.ts; backups additionally validate the
// preferences section against the strict preferences schema before anything
// is written into SQLite.

export const backupDataSchema = portableDataSchema.extend({
  preferences: preferencesSchema.partial().optional(),
});

export const cineTrackBackupSchema = z.object({
  format: z.literal("cinetrack-backup"),
  version: z.literal(1),
  exportedAt: z.string(),
  data: backupDataSchema,
});
