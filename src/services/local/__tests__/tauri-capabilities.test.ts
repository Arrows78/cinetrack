import { describe, expect, it } from "vitest";

import capability from "../../../../src-tauri/capabilities/default.json";

function readDesktopPermissions(): string[] {
  if (!Array.isArray(capability.permissions)) {
    throw new Error("The desktop capability must declare a permissions array");
  }

  return capability.permissions.filter(
    (permission): permission is string => typeof permission === "string",
  );
}

describe("desktop Tauri capabilities", () => {
  it("allows the SQL operations used by local repositories and migrations", () => {
    const permissions = readDesktopPermissions();

    expect(permissions).toContain("sql:default");
    expect(permissions).toContain("sql:allow-execute");
  });
});
