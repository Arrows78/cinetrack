import { invoke } from "@tauri-apps/api/core";

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

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const asApiCommandError = (error: unknown): ApiCommandError => {
  if (error instanceof ApiCommandError) return error;
  if (isStructuredApiError(error)) return new ApiCommandError(error.message, error.status);
  return new ApiCommandError(errorMessage(error));
};

/** Thin wrapper over `invoke()` shared by every repository backed by a Rust command. */
export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw asApiCommandError(error);
  }
}
