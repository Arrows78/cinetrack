import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Moon, Sun } from "lucide-react";

import type { AccentColor, ColorPreset } from "@/shared/constants/colors";
import { cn } from "@/shared/lib/cn";
import { contrastRatio, wcagLevel } from "@/shared/utils/contrast";

export function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-40 space-y-6 lg:scroll-mt-20">
      <div className="max-w-4xl">
        {eyebrow ? <p className="text-overline uppercase text-primary/80">{eyebrow}</p> : null}
        <h2 className="mt-1 font-display text-heading-lg font-bold">{title}</h2>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Subsection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="max-w-3xl">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground/80">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function TokenTile({ label, meta, children }: { label: string; meta?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {children}
      <div>
        <p className="text-sm font-medium">{label}</p>
        {meta ? <p className="break-words font-mono text-xs text-muted-foreground">{meta}</p> : null}
      </div>
    </div>
  );
}

export function WcagBadge({ ratio }: { ratio: number | null }) {
  if (ratio === null) return null;
  const level = wcagLevel(ratio);
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold",
        level === "AAA" && "bg-success text-success-foreground",
        level === "AA" && "bg-warning text-warning-foreground",
        level === "Fail" && "bg-destructive text-destructive-foreground"
      )}
      aria-label={`Contrast ratio ${ratio.toFixed(1)} to 1, WCAG ${level}`}
    >
      {ratio.toFixed(1)}:1 {level}
    </span>
  );
}

export function ColorSwatch({
  label,
  bg,
  fg,
  usage,
  refreshKey,
}: {
  label: string;
  bg: string;
  fg: string;
  usage: string;
  refreshKey: string;
}) {
  const [values, setValues] = useState<{ bgHsl: string; fgHsl: string; ratio: number | null }>({
    bgHsl: "",
    fgHsl: "",
    ratio: null,
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      const bgHsl = style.getPropertyValue(`--${bg}`).trim();
      const fgHsl = style.getPropertyValue(`--${fg}`).trim();
      setValues({ bgHsl, fgHsl, ratio: contrastRatio(bgHsl, fgHsl) });
    });

    return () => cancelAnimationFrame(frame);
  }, [bg, fg, refreshKey]);

  return (
    <div className="flex flex-col gap-3 rounded-panel border border-border/70 bg-card/30 p-3">
      <div
        className="flex h-24 items-center justify-center rounded-card border border-black/10"
        style={{ backgroundColor: `hsl(var(--${bg}))`, color: `hsl(var(--${fg}))` }}
      >
        <span className="text-lg font-semibold">Aa</span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{usage}</p>
      </div>
      <div className="space-y-1 border-t border-border/60 pt-3">
        <p className="break-words font-mono text-caption text-muted-foreground">
          --{bg}
          {values.bgHsl ? ` · ${values.bgHsl}` : ""}
        </p>
        <p className="break-words font-mono text-caption text-muted-foreground/70">
          --{fg}
          {values.fgHsl ? ` · ${values.fgHsl}` : ""}
        </p>
      </div>
      <WcagBadge ratio={values.ratio} />
    </div>
  );
}

const presetThemes = [
  { key: "dark", label: "Dark", icon: Moon, foreground: "225 25% 10%" },
  { key: "light", label: "Light", icon: Sun, foreground: "0 0% 98%" },
] as const;

export function AccentPresetCard({
  accent,
  preset,
  selected,
}: {
  accent: AccentColor;
  preset: ColorPreset;
  selected: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "rounded-panel border border-border p-4 transition-colors",
        selected && "border-primary/50 bg-primary/5"
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{t(`colors.${accent}`)}</p>
          <p className="font-mono text-caption text-muted-foreground">reference.accent.{accent}</p>
        </div>
        {selected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-caption font-semibold text-primary-foreground">
            <Check className="size-3" aria-hidden="true" /> Active
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {presetThemes.map((theme) => {
          const value = preset[theme.key];
          const ratio = contrastRatio(value, theme.foreground);
          const Icon = theme.icon;

          return (
            <div key={theme.key} className="space-y-2">
              <div
                className="flex h-20 items-center justify-center rounded-card border border-black/10 text-lg font-semibold"
                style={{ backgroundColor: `hsl(${value})`, color: `hsl(${theme.foreground})` }}
              >
                Aa
              </div>
              <div className="flex items-center gap-1 text-caption font-medium text-muted-foreground">
                <Icon className="size-3" aria-hidden="true" />
                {theme.label}
              </div>
              <p className="font-mono text-caption text-muted-foreground/70">{value}</p>
              <WcagBadge ratio={ratio} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PrincipleCard({ index, title, children }: { index: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-panel border border-border bg-card/40 p-5">
      <p className="font-mono text-xs text-primary">{index}</p>
      <h3 className="mt-3 font-display text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{children}</p>
    </div>
  );
}

export function Guidance({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "bad" }) {
  return (
    <div
      className={cn(
        "rounded-card border p-4 text-sm leading-6",
        tone === "neutral" && "border-border bg-foreground/[0.03] text-muted-foreground",
        tone === "good" && "border-success/30 bg-success/10 text-foreground",
        tone === "bad" && "border-destructive/30 bg-destructive/10 text-foreground"
      )}
    >
      {children}
    </div>
  );
}

const coverageLabels = {
  live: "Live showcase",
  reference: "API reference",
  internal: "Internal",
} as const;

const coverageClasses = {
  live: "border-success/30 bg-success/10 text-success",
  reference: "border-primary/30 bg-primary/10 text-primary",
  internal: "border-border bg-foreground/5 text-muted-foreground",
} as const;

export function CoverageBadge({ coverage }: { coverage: keyof typeof coverageLabels }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-caption font-semibold",
        coverageClasses[coverage]
      )}
      data-coverage={coverage}
    >
      {coverageLabels[coverage]}
    </span>
  );
}

function MetadataList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span key={value} className="rounded-md border border-border/70 bg-foreground/[0.03] px-2 py-1 text-caption">
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ComponentSpec({
  name,
  source,
  description,
  anatomy,
  variants,
  states,
  guidance,
  accessibility,
  children,
  className,
}: {
  name: string;
  source: string;
  description: string;
  anatomy?: string[];
  variants?: string[];
  states?: string[];
  guidance?: string;
  accessibility?: string;
  children: ReactNode;
  className?: string;
}) {
  const hasMetadata =
    Boolean(anatomy?.length) ||
    Boolean(variants?.length) ||
    Boolean(states?.length) ||
    Boolean(guidance) ||
    Boolean(accessibility);

  return (
    <article className={cn("rounded-panel border border-border bg-card/40 p-5", className)}>
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-display text-heading-sm font-bold">{name}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <code className="shrink-0 rounded-lg bg-foreground/5 px-2 py-1 font-mono text-caption text-muted-foreground">
          {source}
        </code>
      </div>
      {hasMetadata ? (
        <div className="grid gap-4 border-b border-border/60 py-4 text-xs sm:grid-cols-2">
          {anatomy?.length ? <MetadataList label="Anatomy" values={anatomy} /> : null}
          {variants?.length ? <MetadataList label="Variants" values={variants} /> : null}
          {states?.length ? <MetadataList label="States" values={states} /> : null}
          {guidance ? (
            <div>
              <p className="font-semibold uppercase tracking-wide text-muted-foreground">Use when</p>
              <p className="mt-1 leading-5 text-muted-foreground/80">{guidance}</p>
            </div>
          ) : null}
          {accessibility ? (
            <div className="sm:col-span-2">
              <p className="font-semibold uppercase tracking-wide text-muted-foreground">Accessibility</p>
              <p className="mt-1 leading-5 text-muted-foreground/80">{accessibility}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="pt-5">{children}</div>
    </article>
  );
}
