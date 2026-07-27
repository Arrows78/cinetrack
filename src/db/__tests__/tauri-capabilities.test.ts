import { describe, expect, it } from "vitest";

import capability from "../../../src-tauri/capabilities/default.json";

interface ScopedPermission {
  identifier: string;
  allow?: Array<{ path: string }>;
}

function readDesktopPermissions(): string[] {
  if (!Array.isArray(capability.permissions)) {
    throw new Error("The desktop capability must declare a permissions array");
  }

  return capability.permissions.filter((permission): permission is string => typeof permission === "string");
}

function readScopedPermissions(): ScopedPermission[] {
  if (!Array.isArray(capability.permissions)) {
    throw new Error("The desktop capability must declare a permissions array");
  }

  const permissions: unknown[] = capability.permissions;
  return permissions.filter(
    (entry): entry is ScopedPermission => typeof entry === "object" && entry !== null && "identifier" in entry
  );
}

describe("desktop Tauri capabilities", () => {
  it("allows the SQL operations used by local repositories and migrations", () => {
    const permissions = readDesktopPermissions();

    expect(permissions).toContain("sql:default");
    expect(permissions).toContain("sql:allow-execute");
  });

  it("scopes filesystem access to the backups directory only", () => {
    const scoped = readScopedPermissions();
    const fsPermissions = scoped.filter((entry) => entry.identifier.startsWith("fs:"));

    // The app only ever touches $APPDATA/backups/latest.json (see
    // maintenance-service.ts). These permissions must never be granted as
    // bare, unscoped strings again — that would allow reading/writing any
    // text file the OS user has access to.
    expect(fsPermissions.map((entry) => entry.identifier).sort()).toEqual(
      ["fs:allow-exists", "fs:allow-mkdir", "fs:allow-read-text-file", "fs:allow-write-text-file"].sort()
    );

    for (const entry of fsPermissions) {
      expect(entry.allow, `${entry.identifier} must declare an "allow" scope`).toBeDefined();
      for (const scope of entry.allow ?? []) {
        expect(scope.path.startsWith("$APPDATA/backups")).toBe(true);
      }
    }
  });
});
