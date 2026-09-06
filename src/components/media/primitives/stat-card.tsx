import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Panel } from "@/components/ui/panel";

export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  boxed = false,
}: {
  label: string;
  value: string;
  // A plain string most of the time, but also takes a small element (e.g.
  // a delta/trend badge) — either renders fine inside the helper line below.
  helper?: ReactNode;
  /** Only meaningful with boxed — the unboxed variant has no room for one. */
  icon?: LucideIcon;
  // The Home page's compact accent-rule tile (default) and the Statistics
  // page's boxed Panel tile were, until this component, two hand-written
  // copies of the same label/value/helper shape — this flag is the seam
  // that keeps them from drifting apart again rather than a new one.
  boxed?: boolean;
}) {
  if (boxed) {
    return (
      <Panel asChild className="min-w-0">
        <article>
          {Icon ? <Icon className="size-5 text-primary" /> : null}
          <p className="mt-4 text-body-sm text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-3xl font-bold">{value}</p>
          {helper ? <p className="mt-1 text-caption text-muted-foreground">{helper}</p> : null}
        </article>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 border-l-2 border-primary pl-4">
      <p className="text-overline font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="font-display text-3xl font-bold leading-none text-primary">{value}</p>
      {helper ? <p className="mt-1 text-caption text-muted-foreground">{helper}</p> : null}
    </div>
  );
}
