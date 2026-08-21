import { describe, expect, it } from "vitest";

import { errorMessage } from "../errors";

class CustomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomError";
  }
}

describe("errorMessage", () => {
  it("returns the message of a native Error instance", () => {
    expect(errorMessage(new Error("native failure"))).toBe("native failure");
  });

  it("returns the message of a custom Error subclass instance", () => {
    expect(errorMessage(new CustomError("custom failure"))).toBe("custom failure");
  });

  it("returns a plain string input as-is", () => {
    expect(errorMessage("plain string error")).toBe("plain string error");
  });

  it("returns the JSON.stringify form of a plain object", () => {
    expect(errorMessage({ code: "NOT_FOUND", detail: "missing" })).toBe(
      JSON.stringify({ code: "NOT_FOUND", detail: "missing" })
    );
  });

  it("returns the JSON.stringify form of an array", () => {
    expect(errorMessage([1, "two", 3])).toBe(JSON.stringify([1, "two", 3]));
  });

  it("returns the JSON.stringify form of a number (non-throwing stringify path)", () => {
    expect(errorMessage(42)).toBe("42");
  });

  it("returns the JSON.stringify form of a boolean (non-throwing stringify path)", () => {
    expect(errorMessage(true)).toBe("true");
  });

  it("falls back to String(error) when JSON.stringify throws on a circular reference", () => {
    const circular: Record<string, unknown> = { name: "circular" };
    circular.self = circular;

    expect(errorMessage(circular)).toBe(String(circular));
  });
});
