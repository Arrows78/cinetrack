import { invoke } from "@tauri-apps/api/core";

import type { TauriCommandName } from "@/generated/tauri-command-names";
import { logger } from "@/shared/lib/logger";
import { errorMessage } from "@/shared/lib/errors";

// Shape of the Err(ApiError) every migrated Rust command serializes over IPC
// (see src-tauri/src/error.rs) — invoke() rejects with this object directly,
// no string parsing needed. `status` mirrors an HTTP status code so this
// same shape can later back a real HTTP API without changing callers.
interface StructuredApiError {
  message: string;
  status?: number;
}

const isStructuredApiError = (error: unknown): error is StructuredApiError =>
  typeof error === "object" &&
  error !== null &&
  "message" in error &&
  typeof (error as { message: unknown }).message === "string";

export class ApiCommandError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "ApiCommandError";
  }
}

const asApiCommandError = (error: unknown): ApiCommandError => {
  if (error instanceof ApiCommandError) return error;
  if (isStructuredApiError(error)) return new ApiCommandError(error.message, error.status);
  return new ApiCommandError(errorMessage(error));
};

/** Thin wrapper over `invoke()` shared by every repository backed by a Rust command. */
export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await invoke<T>(command, args);
    // Round-trip time as observed from the caller — includes IPC
    // serialization and the full Rust-side command/service/SQL chain, not
    // just the SQL itself (see docs/architecture.md's "Architecture
    // boundaries" section for the layers this crosses). A local,
    // file-based performance signal, not remote telemetry — see
    // src/shared/lib/logger.ts's own doc comment.
    logger.info(`layer=frontend command=${command} duration=${Math.round(performance.now() - startedAt)}ms`);
    return result;
  } catch (error) {
    logger.info(
      `layer=frontend command=${command} duration=${Math.round(performance.now() - startedAt)}ms status=error`
    );
    throw asApiCommandError(error);
  }
}

export type TauriCommand<Args, Result> = {
  readonly name: TauriCommandName;
  readonly __types?: {
    readonly args: Args;
    readonly result: Result;
  };
};

export const defineCommand = <Args, Result>(name: TauriCommandName): TauriCommand<Args, Result> => ({ name });

export function invokeTypedCommand<Result>(command: TauriCommand<undefined, Result>): Promise<Result>;
export function invokeTypedCommand<Args extends object, Result>(
  command: TauriCommand<Args, Result>,
  args: Args
): Promise<Result>;
export function invokeTypedCommand<Args extends object | undefined, Result>(
  command: TauriCommand<Args, Result>,
  args?: Args
): Promise<Result> {
  return invokeCommand<Result>(command.name, args as Record<string, unknown> | undefined);
}
