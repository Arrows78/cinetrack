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

  it("passes an already-constructed ApiCommandError rejection through unchanged", async () => {
    const { invokeCommand, ApiCommandError } = await import("../invoke");
    const original = new ApiCommandError("already wrapped", 500);
    invokeMock.mockRejectedValueOnce(original);

    await expect(invokeCommand("some_command")).rejects.toBe(original);
  });
});

describe("invokeTypedCommand", () => {
  it("forwards a typed command definition and args through invokeCommand", async () => {
    invokeMock.mockResolvedValueOnce({ ok: true });
    const { defineCommand, invokeTypedCommand } = await import("../invoke");
    const command = defineCommand<{ key: string; value: unknown }, { ok: boolean }>("update_preference");

    await expect(invokeTypedCommand(command, { key: "theme", value: "dark" })).resolves.toEqual({ ok: true });
    expect(invokeMock).toHaveBeenCalledWith("update_preference", { key: "theme", value: "dark" });
  });

  it("supports typed commands without args", async () => {
    invokeMock.mockResolvedValueOnce(["ok"]);
    const { defineCommand, invokeTypedCommand } = await import("../invoke");
    const command = defineCommand<undefined, string[]>("list_library");

    await expect(invokeTypedCommand(command)).resolves.toEqual(["ok"]);
    expect(invokeMock).toHaveBeenCalledWith("list_library", undefined);
  });
});
