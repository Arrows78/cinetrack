// A thin public-surface wrapper around desktop-service.ts, kept in its own
// use-*.ts file so cross-feature callers (see desktop-settings.tsx) go
// through this module's own architecture-boundary-allowed name instead of
// reaching into desktop-service.ts directly. The dynamic import below stays
// dynamic here too — desktop-service.ts pulls in the app router (for its
// deep-link navigation), which callers remapping a shortcut have no other
// reason to load eagerly, and re-exporting it as a static binding from
// index.ts previously defeated that (index.ts is statically imported
// elsewhere for unrelated exports, which dragged the router in with it).
export function useDesktopShortcuts() {
  const updateGlobalShortcut = async (next: string) => {
    const { desktopService } = await import("@/features/desktop/desktop-service");
    await desktopService.updateGlobalShortcut(next);
  };

  return { updateGlobalShortcut };
}
