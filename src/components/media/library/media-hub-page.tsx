import { useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { LibraryExplorer } from "@/components/media/library/library-explorer";
import { SectionHeader } from "@/components/media/primitives/section-header";
import type { MediaType } from "@/types/media";

/**
 * Series and Movies pages were near-identical (title/icon/i18n keys aside) —
 * this is the one component both now render, so the two views can't drift
 * apart from each other over time the way two hand-maintained copies would.
 *
 * Used to also offer an "Upcoming" tab (TrackingList, filtered to this
 * media type) alongside "My list", but that was the same information the
 * standalone Tracking page already shows — two navigation paths to one
 * answer. Dropped in favor of Tracking being the one place for "what's
 * coming up"; this page is only ever the library view now, so there's
 * nothing left to switch between.
 */
export function MediaHubPage({
  mediaType,
  icon,
  title,
  subtitle,
  browseAllLabel,
}: {
  mediaType: MediaType;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  browseAllLabel: string;
}) {
  const navigate = useNavigate();
  const browseAll = () => void navigate({ to: "/search", search: { scope: mediaType } });

  return (
    <div className="space-y-8">
      <SectionHeader title={title} subtitle={subtitle} icon={icon} isPageTitle />
      <LibraryExplorer lockedMediaType={mediaType} onBrowseAll={browseAll} browseAllLabel={browseAllLabel} />
    </div>
  );
}
