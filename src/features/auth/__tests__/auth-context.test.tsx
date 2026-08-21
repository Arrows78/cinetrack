import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import { useAuth } from "../auth-context";

// auth-provider.test.tsx always renders useAuth() inside a real <AuthProvider>,
// so the guard branch below — calling useAuth() with no provider ancestor —
// has no coverage elsewhere. This is the one real branch in this file.
describe("useAuth", () => {
  it("throws when used outside of an AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow("useAuth must be used inside AuthProvider.");
  });
});
