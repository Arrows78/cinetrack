import { describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

describe("invokeCommand", () => {
  it("forwards the command name and args and returns the resolved value", async () => {
    invokeMock.mockResolvedValueOnce({ ok: true });
    const { invokeCommand } = await import("../invoke");

    await expect(invokeCommand("some_command", { a: 1 })).resolves.toEqual({ ok: true });
    expect(invokeMock).toHaveBeenCalledWith("some_command", { a: 1 });
  });

  it("wraps a structured { message, status } rejection into an ApiCommandError", async () => {
    invokeMock.mockRejectedValue({ message: "Not found", status: 404 });
    const { invokeCommand, ApiCommandError } = await import("../invoke");

    await expect(invokeCommand("some_command")).rejects.toBeInstanceOf(ApiCommandError);
    await expect(invokeCommand("some_command")).rejects.toMatchObject({ message: "Not found", status: 404 });
  });

  it("falls back to a generic message for an unstructured rejection", async () => {
    invokeMock.mockRejectedValueOnce("boom");
    const { invokeCommand } = await import("../invoke");

    await expect(invokeCommand("some_command")).rejects.toMatchObject({ message: "boom", status: undefined });
  });
});
