import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { cn } from "@/shared/lib/cn";

export interface ActivityBarChartDatum {
  label: string;
  value: number;
}

// Theme references, not copy — hoisted out of the JSX tree so
// eslint-plugin-i18next's jsx-only literal-string check (which only scans
// string literals written inline in JSX) doesn't flag them the way it would
// an actual inline `contentStyle={{ ... }}` object.
const MUTED_FOREGROUND = "hsl(var(--muted-foreground))";
const CURSOR_FILL = "hsl(var(--foreground) / 0.06)";
const PRIMARY = "hsl(var(--primary))";
const TOOLTIP_CONTENT_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.75rem",
  color: "hsl(var(--popover-foreground))",
  fontSize: "0.8125rem",
};

/**
 * Shared bar chart for the Stats page's activity panels — interactive
 * (hover tooltips) in place of the hand-rolled `<div>`-height bars this
 * replaced. Marked `aria-hidden`: every caller renders an `sr-only` table
 * alongside it with the same data, so screen reader users get exact values
 * instead of an unlabeled chart.
 */
export function ActivityBarChart({
  data,
  tooltipLabel,
  height = 176,
  className,
}: {
  data: ActivityBarChartDatum[];
  /** Series name shown in the tooltip, e.g. "watches". */
  tooltipLabel: string;
  height?: number;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("mt-5", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" stroke={MUTED_FOREGROUND} fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: CURSOR_FILL }}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            formatter={(value) => [value ?? 0, tooltipLabel]}
          />
          <Bar dataKey="value" fill={PRIMARY} fillOpacity={0.8} radius={[6, 6, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
