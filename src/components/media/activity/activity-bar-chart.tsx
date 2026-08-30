import { lazy, Suspense } from "react";
import type { ActivityBarChartDatum } from "@/components/media/activity/activity-bar-chart-impl";

export type { ActivityBarChartDatum } from "@/components/media/activity/activity-bar-chart-impl";

// recharts pulls in a sizeable d3 dependency graph regardless of which of
// its components are used — lazy-loaded so the Stats route's other panels
// (cards, records, heatmap) can paint before that chunk finishes fetching,
// instead of every Stats chart blocking on it up front.
const LazyActivityBarChart = lazy(() =>
  import("@/components/media/activity/activity-bar-chart-impl").then((module) => ({
    default: module.ActivityBarChart,
  }))
);

export function ActivityBarChart(props: {
  data: ActivityBarChartDatum[];
  /** Series name shown in the tooltip, e.g. "watches". */
  tooltipLabel: string;
  height?: number;
  className?: string;
  /** Renders the last bar (the current month/year, in every caller's data — always chronological, ending now) in primary, every other bar muted. */
  highlightLast?: boolean;
}) {
  return (
    <Suspense fallback={<div aria-hidden="true" style={{ height: props.height ?? 176 }} />}>
      <LazyActivityBarChart {...props} />
    </Suspense>
  );
}
