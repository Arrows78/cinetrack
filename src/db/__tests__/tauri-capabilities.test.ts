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
  it("does not grant the SQL plugin — all database access goes through Rust commands", () => {
    const permissions = readDesktopPermissions();

    expect(permissions).not.toContain("sql:default");
    expect(permissions).not.toContain("sql:allow-execute");
  });

  it("grants only the specific plugin commands this app actually calls, never a plugin's whole :default set", () => {
    const permissions = readDesktopPermissions();

    // Each of these plugins' own `:default` permission set bundles several
    // commands this app never calls (see default.json's own description
    // for how to re-derive this list) — e.g. notification:default alone
    // grants 16 commands where notification-service.ts only ever calls 3.
    // Regranting any of these plugins' bare `:default` string would widen
    // this back out silently.
    for (const wideDefault of [
      "deep-link:default",
      "notification:default",
      "opener:default",
      "os:default",
      "stronghold:default",
      "process:default",
    ]) {
      expect(permissions).not.toContain(wideDefault);
    }

    expect(permissions).toEqual(
      expect.arrayContaining([
        "deep-link:allow-get-current",
        "notification:allow-is-permission-granted",
        "notification:allow-request-permission",
        "notification:allow-notify",
        "opener:allow-default-urls",
        "os:allow-os-type",
        "stronghold:allow-initialize",
        "stronghold:allow-create-client",
        "stronghold:allow-load-client",
        "stronghold:allow-get-store-record",
        "stronghold:allow-save-store-record",
        "stronghold:allow-save",
        "process:allow-restart",
      ])
    );
  });

  it("scopes filesystem access to the backups and logs directories only", () => {
    const scoped = readScopedPermissions();
    const fsPermissions = scoped.filter((entry) => entry.identifier.startsWith("fs:"));

    // The app only ever touches $APPDATA/backups (maintenance-service.ts)
    // and $APPDATA/logs (diagnostics/logger.ts). These permissions must
    // never be granted as bare, unscoped strings again — that would allow
    // reading/writing any text file the OS user has access to.
    expect(fsPermissions.map((entry) => entry.identifier).sort()).toEqual(
      [
        "fs:allow-exists",
        "fs:allow-mkdir",
        "fs:allow-read-dir",
        "fs:allow-read-text-file",
        "fs:allow-remove",
        "fs:allow-rename",
        "fs:allow-stat",
        "fs:allow-write-text-file",
      ].sort()
    );

    for (const entry of fsPermissions) {
      expect(entry.allow, `${entry.identifier} must declare an "allow" scope`).toBeDefined();
      for (const scope of entry.allow ?? []) {
        expect(scope.path.startsWith("$APPDATA/backups") || scope.path.startsWith("$APPDATA/logs")).toBe(true);
      }
    }
  });
});
