import { useEffect, useState, type ReactNode } from "react";
import { Check, Moon, Sun } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tile } from "@/components/ui/tile";
import { usePreferences } from "@/features/preferences/use-preferences";
import { COLOR_PRESETS, type AccentColor, type ColorPreset } from "@/shared/constants/colors";
import { contrastRatio, wcagLevel } from "@/shared/utils/contrast";
import { cn } from "@/shared/lib/cn";

// Internal dev tool — reachable only at /design-system, and only registered
// in the route tree when import.meta.env.DEV is true (see router-config.tsx).
// Not localized on purpose: it documents the token system for whoever is
// building UI, not end users, so it doesn't need react-i18next or entries in
// locale-parity.test.ts.

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-40 space-y-4 lg:scroll-mt-20">
      <div>
        <h2 className="font-display text-heading-lg font-bold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function TokenTile({ label, meta, children }: { label: string; meta?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {children}
      <div>
        <p className="text-sm font-medium">{label}</p>
        {meta ? <p className="font-mono text-xs text-muted-foreground">{meta}</p> : null}
      </div>
    </div>
  );
}

function WcagBadge({ ratio }: { ratio: number | null }) {
  if (ratio === null) return null;
  const level = wcagLevel(ratio);
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
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

// Reads the *live* CSS custom properties instead of hand-typed hex/HSL —
// the numbers here can never drift from what's actually in styles/index.css,
// unlike the header comment there that sat wrong for a long time before this
// component's math caught it (see contrast.ts).
function ColorSwatch({ label, bg, fg, refreshKey }: { label: string; bg: string; fg: string; refreshKey: string }) {
  const [values, setValues] = useState<{ bgHsl: string; fgHsl: string; ratio: number | null }>({
    bgHsl: "",
    fgHsl: "",
    ratio: null,
  });

  useEffect(() => {
    // ThemeController writes the accent variables in its own effect. Reading
    // on the next animation frame guarantees this catalog sees the final
    // cascade instead of the previous preference for one render.
    const frame = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      const bgHsl = style.getPropertyValue(`--${bg}`).trim();
      const fgHsl = style.getPropertyValue(`--${fg}`).trim();
      setValues({ bgHsl, fgHsl, ratio: contrastRatio(bgHsl, fgHsl) });
    });

    return () => cancelAnimationFrame(frame);
  }, [bg, fg, refreshKey]);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-20 items-center justify-center rounded-card border border-border/50"
        style={{ backgroundColor: `hsl(var(--${bg}))`, color: `hsl(var(--${fg}))` }}
      >
        <span className="text-lg font-semibold">Aa</span>
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="font-mono text-xs text-muted-foreground">
          --{bg}
          {values.bgHsl ? ` · ${values.bgHsl}` : ""}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground/70">
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

// Presets not currently selected never reach the DOM, so the catalog reads
// COLOR_PRESETS directly and displays both theme variants side by side. That
// makes the accessibility contract visible without toggling app preferences.
function AccentPresetCard({
  accent,
  preset,
  selected,
}: {
  accent: AccentColor;
  preset: ColorPreset;
  selected: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-panel border border-border p-3 transition-colors",
        selected && "border-primary/50 bg-primary/5"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{preset.label}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{accent}</p>
        </div>
        {selected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
            <Check className="size-3" aria-hidden="true" /> Active
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {presetThemes.map((theme) => {
          const value = preset[theme.key];
          const ratio = contrastRatio(value, theme.foreground);
          const Icon = theme.icon;

          return (
            <div key={theme.key} className="space-y-2">
              <div
                className="flex h-16 items-center justify-center rounded-card border border-black/10 text-lg font-semibold"
                style={{ backgroundColor: `hsl(${value})`, color: `hsl(${theme.foreground})` }}
              >
                Aa
              </div>
              <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                <Icon className="size-3" aria-hidden="true" />
                {theme.label}
              </div>
              <p className="font-mono text-[10px] text-muted-foreground/70">{value}</p>
              <WcagBadge ratio={ratio} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const colorGroups: { title: string; description: string; pairs: { label: string; bg: string; fg: string }[] }[] = [
  {
    title: "Surface",
    description: "Neutral UI chrome — the least opinionated colors, used the most often.",
    pairs: [
      { label: "Background", bg: "background", fg: "foreground" },
      { label: "Card", bg: "card", fg: "card-foreground" },
      { label: "Popover", bg: "popover", fg: "popover-foreground" },
      { label: "Muted", bg: "muted", fg: "muted-foreground" },
    ],
  },
  {
    title: "Brand",
    description:
      'Identity-carrying. Primary follows the user\'s chosen accent (Settings → "Accent color") and swaps at runtime via ThemeController — the swatch below always reflects whatever is currently active.',
    pairs: [
      { label: "Primary", bg: "primary", fg: "primary-foreground" },
      { label: "Secondary", bg: "secondary", fg: "secondary-foreground" },
      { label: "Accent", bg: "accent", fg: "accent-foreground" },
    ],
  },
  {
    title: "Semantic",
    description: "Status colors — meaning, not decoration. Reused for badges, banners, and confetti alike.",
    pairs: [
      { label: "Destructive", bg: "destructive", fg: "destructive-foreground" },
      { label: "Success", bg: "success", fg: "success-foreground" },
      { label: "Warning", bg: "warning", fg: "warning-foreground" },
    ],
  },
];

const lineTokens: { label: string; varName: string }[] = [
  { label: "Border", varName: "border" },
  { label: "Input", varName: "input" },
  { label: "Ring", varName: "ring" },
];

const typeFamilies: { name: string; role: string; sampleClassName: string; usage: string }[] = [
  {
    name: "Syne",
    role: "Display",
    sampleClassName: "font-display font-bold",
    usage: "font-display — headings, hero titles, stat numbers",
  },
  {
    name: "DM Sans",
    role: "Body",
    sampleClassName: "font-sans",
    usage: "font-sans — everything else: labels, buttons, body copy",
  },
  {
    name: "Playfair Display",
    role: "Editorial serif",
    sampleClassName: "font-serif italic",
    usage: "font-serif italic — movie/series synopsis text only",
  },
];

const typeRoles: { name: string; className: string; meta: string; display?: boolean }[] = [
  { name: "display-hero", className: "text-display-hero", meta: "56px · 800 · -0.02em", display: true },
  { name: "display-title", className: "text-display-title", meta: "36px · 700 · -0.01em", display: true },
  { name: "heading-lg", className: "text-heading-lg font-semibold", meta: "24px · 600" },
  { name: "heading-md", className: "text-heading-md font-semibold", meta: "20px · 600" },
  { name: "heading-sm", className: "text-heading-sm font-semibold", meta: "18px · 600" },
  { name: "body-lg", className: "text-body-lg", meta: "17px · 400" },
  { name: "body", className: "text-body", meta: "15px · 400" },
  { name: "body-sm", className: "text-body-sm", meta: "13px · 400" },
  { name: "caption", className: "text-caption text-muted-foreground", meta: "12px · 400" },
  { name: "overline", className: "text-overline uppercase text-muted-foreground", meta: "10px · 600 · 0.3em" },
];

const radii: { name: string; className: string }[] = [
  { name: "sm", className: "rounded-sm" },
  { name: "md", className: "rounded-md" },
  { name: "lg", className: "rounded-lg" },
  { name: "card", className: "rounded-card" },
  { name: "panel", className: "rounded-panel" },
  { name: "shell", className: "rounded-shell" },
  { name: "hero", className: "rounded-hero" },
];

const shadows: { name: string; className: string }[] = [
  { name: "elevation-xs", className: "shadow-elevation-xs" },
  { name: "elevation-sm", className: "shadow-elevation-sm" },
  { name: "elevation-md", className: "shadow-elevation-md" },
  { name: "elevation-lg", className: "shadow-elevation-lg" },
  { name: "elevation-xl", className: "shadow-elevation-xl" },
  { name: "glow", className: "shadow-glow" },
];

// The "tint" scale isn't a named config token — it's Tailwind's own opacity
// modifier applied to the `foreground` color (bg-foreground/[value]), which
// self-inverts per theme since --foreground is near-black in light mode and
// near-white in dark mode. That single class replaces the old two-class
// bg-black/[x] dark:bg-white/[x] pattern everywhere it was used. Documented
// here as a scale (not reinvented per call site) the same way z-index is.
const tintScale: { value: string; usage: string }[] = [
  { value: "[0.02]", usage: "Nested content directly under a tinted header (season accordion content)" },
  { value: "[0.03]", usage: 'Panel tone="subtle", tracked-series rows, accordion trigger' },
  { value: "[0.04]", usage: "Empty-state icon circle, episode row hover" },
  { value: "5", usage: "Skeleton, sidebar nav surfaces, theme toggle hover, genre chips, seen-toggle idle state" },
  { value: "[0.06]", usage: "Hover/active state over a [0.03] surface, filter-bar track background" },
  { value: "[0.07]", usage: "Decorative timeline connector (history page)" },
  { value: "[0.08]", usage: "Media progress-bar track (progress-bar.tsx, the custom gradient one)" },
  {
    value: "10",
    usage: "Separator, ui/Progress track, Sheet close-button hover, filter-bar active segment, sidebar collapse button",
  },
  { value: "20", usage: "Unwatched episode dots, seen-toggle idle border" },
];

// Tailwind's default rem-based spacing scale already is the app's spacing
// token system (0.25rem increments) — formalizing it here means documenting
// it, not reinventing a parallel vocabulary nothing in the app would use.
const spacingSteps = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];

const motionTokens: { name: string; className: string }[] = [
  { name: "fast — 200ms", className: "duration-fast" },
  { name: "base — 300ms", className: "duration-base" },
  { name: "slow — 600ms", className: "duration-slow" },
  { name: "slower — 700ms", className: "duration-slower" },
  { name: "slowest — 1000ms", className: "duration-slowest" },
];

const zIndexScale: { name: string; value: string; usage: string }[] = [
  { name: "raised", value: "10", usage: "Element raised within its own stacking context (e.g. history page)" },
  { name: "sticky", value: "30", usage: "Sticky mobile header (AppShell), this catalog's quick-nav" },
  { name: "dropdown", value: "40", usage: "Dropdown menus, popovers" },
  { name: "overlay", value: "50", usage: "Dimmed backdrop / floating banners (Sheet, indicators)" },
  { name: "modal", value: "50", usage: "Sheet/Dialog content" },
  { name: "toast", value: "60", usage: "Notifications above everything else" },
  { name: "command-palette", value: "100", usage: "Command palette (Cmd+K), above everything" },
];

const buttonVariantList = ["default", "secondary", "ghost", "outline", "destructive"] as const;
const buttonSizeList = ["sm", "default", "lg", "icon"] as const;
const badgeVariantList = ["default", "secondary", "outline", "movie", "series"] as const;

const navSections = [
  { id: "colors", label: "Colors" },
  { id: "typography", label: "Typography" },
  { id: "radius", label: "Radius" },
  { id: "shadows", label: "Shadows" },
  { id: "tint", label: "Tint" },
  { id: "spacing", label: "Spacing" },
  { id: "motion", label: "Motion" },
  { id: "z-index", label: "Z-index" },
  { id: "components", label: "Components" },
];
const navSectionIds = navSections.map((section) => section.id);

function useActiveSection(sectionIds: string[]) {
  const [activeSection, setActiveSection] = useState(sectionIds[0] ?? "");

  useEffect(() => {
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-18% 0px -72% 0px", threshold: [0, 1] }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [sectionIds]);

  return activeSection;
}

export function DesignSystemPage() {
  const preferences = usePreferences();
  const theme = preferences.data?.theme ?? "dark";
  const accent = preferences.data?.accentColor ?? "violet";
  const activePreset = COLOR_PRESETS[accent];
  const activeSection = useActiveSection(navSectionIds);
  const refreshKey = `${theme}:${accent}`;
  const semanticPairCount = colorGroups.reduce((total, group) => total + group.pairs.length, 0);
  const contrastCheckCount = semanticPairCount + Object.keys(COLOR_PRESETS).length * presetThemes.length;

  return (
    <div className="space-y-12 pb-16">
      <div className="relative overflow-hidden rounded-hero border border-border bg-card/60 p-6 shadow-elevation-sm sm:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="relative">
          <p className="text-overline uppercase text-primary/80">Internal tool · dev only</p>
          <h1 className="mt-2 font-display text-display-title font-bold">Design system</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Living catalog of foundations and <code className="font-mono text-xs">components/ui</code> primitives.
            Sources of truth: <code className="font-mono text-xs">src/styles/index.css</code> and{" "}
            <code className="font-mono text-xs">tailwind.config.ts</code>. Contrast values are calculated from the real
            tokens instead of copied into documentation.
          </p>

          <div className="section-rule mt-6 max-w-xl" aria-hidden="true" />

          <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-card border border-border/70 bg-foreground/[0.03] p-4">
              <dt className="text-xs text-muted-foreground">Current theme</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm font-semibold capitalize">
                {theme === "dark" ? (
                  <Moon className="size-4" aria-hidden="true" />
                ) : (
                  <Sun className="size-4" aria-hidden="true" />
                )}
                {theme}
              </dd>
            </div>
            <div className="rounded-card border border-border/70 bg-foreground/[0.03] p-4">
              <dt className="text-xs text-muted-foreground">Active accent</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm font-semibold">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: `hsl(${theme === "dark" ? activePreset.dark : activePreset.light})` }}
                  aria-hidden="true"
                />
                {activePreset.label}
              </dd>
            </div>
            <div className="rounded-card border border-border/70 bg-foreground/[0.03] p-4">
              <dt className="text-xs text-muted-foreground">Catalog sections</dt>
              <dd className="mt-1 text-sm font-semibold">{navSections.length} foundations & primitives</dd>
            </div>
            <div className="rounded-card border border-border/70 bg-foreground/[0.03] p-4">
              <dt className="text-xs text-muted-foreground">Contrast checks</dt>
              <dd className="mt-1 text-sm font-semibold">{contrastCheckCount} live or config-backed pairs</dd>
            </div>
          </dl>
        </div>
      </div>

      <nav
        className="sticky top-20 z-sticky -mx-4 flex gap-1 overflow-x-auto border-y border-border bg-background/90 px-4 py-2 backdrop-blur-md lg:top-0 lg:-mx-6 lg:px-6"
        aria-label="Design system sections"
      >
        {navSections.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={activeSection === item.id ? "location" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              activeSection === item.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            )}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <Section
        id="colors"
        title="Colors"
        description="Grouped by role, not alphabetically — surface (neutral chrome), brand (identity), semantic (status). Background/foreground pairs from src/styles/index.css (:root = dark, .light = light)."
      >
        <div className="space-y-8">
          {colorGroups.map((group) => (
            <div key={group.title} className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground/80">{group.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {group.pairs.map((pair) => (
                  <ColorSwatch key={pair.bg} label={pair.label} bg={pair.bg} fg={pair.fg} refreshKey={refreshKey} />
                ))}
              </div>
            </div>
          ))}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Lines</h3>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {lineTokens.map((token) => (
                <TokenTile key={token.varName} label={token.label} meta={`--${token.varName}`}>
                  <div className="h-10 rounded-card border-2" style={{ borderColor: `hsl(var(--${token.varName}))` }} />
                </TokenTile>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Accent presets</p>
            <p className="mb-3 max-w-3xl text-xs leading-5 text-muted-foreground/80">
              Override <code className="font-mono">--primary</code>/<code className="font-mono">--ring</code> at
              runtime. Both control-fill pairings are shown because the AA contract applies to every preset, not only
              the one currently selected. Regression tests also cover primary-colored text on each theme background. The
              active preference is outlined.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(Object.entries(COLOR_PRESETS) as [AccentColor, ColorPreset][]).map(([key, preset]) => (
                <AccentPresetCard key={key} accent={key} preset={preset} selected={key === accent} />
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="typography"
        title="Typography"
        description="Three families, each with exactly one job — not the same pairing you'd reach for on any other project."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {typeFamilies.map((family) => (
            <div key={family.name} className="rounded-panel border border-border bg-card/40 p-5">
              <p className={cn("text-3xl", family.sampleClassName)}>Aa Bb Cc</p>
              <p className="mt-3 text-sm font-semibold">{family.name}</p>
              <p className="text-xs text-muted-foreground">{family.role}</p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground/70">{family.usage}</p>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <p className="text-sm font-medium">Type roles</p>
          {typeRoles.map((role) => (
            <div
              key={role.name}
              className="flex flex-col gap-2 border-b border-border/40 pb-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <p className={cn("min-w-0 break-words", role.className, role.display && "font-display")}>
                The quick brown fox
              </p>
              <div className="shrink-0 text-right">
                <p className="font-mono text-xs">text-{role.name}</p>
                <p className="text-xs text-muted-foreground">{role.meta}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section id="radius" title="Radius" description="Surface scale (posters → hero panels), exposed as rounded-*.">
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {radii.map((radius) => (
            <TokenTile key={radius.name} label={radius.name} meta={`rounded-${radius.name}`}>
              <div className={cn("h-20 w-full bg-primary/15 border border-primary/30", radius.className)} />
            </TokenTile>
          ))}
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="shadows"
        title="Shadows / elevation"
        description="shadow-elevation-* — distinct from Tailwind's own shadow-sm/xl/2xl, already used elsewhere."
      >
        <div className="grid grid-cols-2 gap-6 rounded-panel bg-foreground/5 p-6 sm:grid-cols-3 lg:grid-cols-6">
          {shadows.map((shadow) => (
            <TokenTile key={shadow.name} label={shadow.name}>
              <div className={cn("h-20 w-full rounded-panel bg-card", shadow.className)} />
            </TokenTile>
          ))}
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="tint"
        title="Tint"
        description={
          'bg-foreground/[value] — a single, theme-invariant class for the "contrast overlay" family (subtle panels, hover states, tracks, dividers). Replaces the old bg-black/[x] dark:bg-white/[x] pair.'
        }
      >
        <div className="overflow-x-auto rounded-panel border border-border">
          <table className="min-w-[640px] w-full text-sm">
            <thead className="bg-foreground/5">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Class</th>
                <th className="px-4 py-2 text-left font-medium">Usage</th>
              </tr>
            </thead>
            <tbody>
              {tintScale.map((tier) => (
                <tr key={tier.value} className="border-t border-border/60">
                  <td className="px-4 py-2 font-mono text-xs">bg-foreground/{tier.value}</td>
                  <td className="px-4 py-2 text-muted-foreground">{tier.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-4">
          {tintScale.map((tier) => (
            <TokenTile key={tier.value} label={tier.value}>
              <div className={cn("h-16 w-16 rounded-xl border border-border", `bg-foreground/${tier.value}`)} />
            </TokenTile>
          ))}
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="spacing"
        title="Spacing"
        description="Already tokenized — Tailwind's default scale (no parallel vocabulary invented)."
      >
        <div className="space-y-2">
          {spacingSteps.map((step) => (
            <div key={step} className="flex items-center gap-4">
              <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                p-{step} · {(step * 0.25).toString()}rem
              </span>
              <div className="h-3 rounded-full bg-primary/60" style={{ width: `${step * 0.25}rem` }} />
            </div>
          ))}
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section id="motion" title="Motion" description="Named durations + the --ease-out-expo curve (hover each bar).">
        <div className="space-y-3">
          {motionTokens.map((token) => (
            <div key={token.name} className="flex items-center gap-4">
              <span className="w-40 shrink-0 font-mono text-xs text-muted-foreground">{token.name}</span>
              <button
                type="button"
                className="group h-10 w-full max-w-md overflow-hidden rounded-full bg-foreground/5 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`Preview ${token.name} motion token`}
              >
                <div
                  className={cn(
                    "h-full w-10 rounded-full bg-primary transition-transform ease-out-expo group-hover:translate-x-[calc(100%-2.5rem)] group-focus-visible:translate-x-[calc(100%-2.5rem)]",
                    token.className
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section id="z-index" title="Z-index" description="Named scale, additive to Tailwind's default numeric scale.">
        <div className="overflow-x-auto rounded-panel border border-border">
          <table className="min-w-[640px] w-full text-sm">
            <thead className="bg-foreground/5">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Token</th>
                <th className="px-4 py-2 text-left font-medium">Value</th>
                <th className="px-4 py-2 text-left font-medium">Usage</th>
              </tr>
            </thead>
            <tbody>
              {zIndexScale.map((tier) => (
                <tr key={tier.name} className="border-t border-border/60">
                  <td className="px-4 py-2 font-mono text-xs">z-{tier.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{tier.value}</td>
                  <td className="px-4 py-2 text-muted-foreground">{tier.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="components"
        title="Components"
        description="components/ui primitives, unchanged — this catalog documents them, it doesn't modify them."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Card</CardTitle>
              <CardDescription>
                card.tsx — glass surface (<code className="font-mono">.surface</code>: bg-card/80 + backdrop-blur +
                shadow-elevation-sm) at rounded-panel. Every demo in this section is itself a Card — this is the one
                place it gets shown as the subject rather than the container.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                CardHeader / CardTitle / CardDescription above, CardContent here.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Button</CardTitle>
              <CardDescription>Variants × sizes (button-variants.ts)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                {buttonVariantList.map((variant) => (
                  <Button key={variant} variant={variant}>
                    {variant}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {buttonSizeList.map((size) => (
                  <Button key={size} size={size}>
                    {size === "icon" ? "•" : size}
                  </Button>
                ))}
                <Button disabled>disabled</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Badge</CardTitle>
              <CardDescription>
                badge.tsx — <code className="font-mono">movie</code>/<code className="font-mono">series</code> are the
                media-type chip colors, reused both in the detail hero and (with a{" "}
                <code className="font-mono">backdrop-blur-sm</code> className override) over poster art.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {badgeVariantList.map((variant) => (
                  <Badge key={variant} variant={variant}>
                    {variant}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Panel</CardTitle>
              <CardDescription>
                panel.tsx — flat container, distinct from Card (glass + shadow). <code className="font-mono">tone</code>{" "}
                = "card" (bg-card/60) or "subtle" (bg-foreground/[0.03]). <code className="font-mono">asChild</code> to
                render as another element (Link, article...).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Panel>
                <p className="text-sm font-medium">tone="card" (default)</p>
                <p className="text-xs text-muted-foreground">rounded-panel · border-border · bg-card/60</p>
              </Panel>
              <Panel tone="subtle">
                <p className="text-sm font-medium">tone="subtle"</p>
                <p className="text-xs text-muted-foreground">rounded-panel · border-border · bg-foreground/[0.03]</p>
              </Panel>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tile</CardTitle>
              <CardDescription>
                tile.tsx — minimal bordered box for list rows and small nested blocks. No default background or padding:
                a plainer, smaller sibling of Panel (rounded-xl vs rounded-panel).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Tile className="px-3 py-2 text-sm">rounded-xl · border-border</Tile>
              <Tile className="flex items-center justify-between px-3 py-2 text-sm">
                <span>Row content</span>
                <strong>42</strong>
              </Tile>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Input</CardTitle>
              <CardDescription>
                input.tsx — <code className="font-mono">size</code> "default" (search, prominent) or "sm" (compact
                forms: settings, filters, editors).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="size=default" />
              <Input size="sm" placeholder="size=sm" />
              <Input size="sm" placeholder="Disabled" disabled />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Select</CardTitle>
              <CardDescription>select.tsx — same footprint as Input size="sm", for native lists.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select defaultValue="a">
                <option value="a">Option A</option>
                <option value="b">Option B</option>
              </Select>
              <Select disabled defaultValue="a">
                <option value="a">Disabled</option>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Textarea</CardTitle>
              <CardDescription>
                textarea.tsx — same border/background/focus recipe as Input, no fixed height (set{" "}
                <code className="font-mono">min-h-*</code> per call site).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea className="min-h-20" placeholder="Placeholder" />
              <Textarea className="min-h-20" placeholder="Disabled" disabled />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
              <CardDescription>progress.tsx</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={25} />
              <Progress value={60} />
              <Progress value={90} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Skeleton</CardTitle>
              <CardDescription>skeleton.tsx</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Separator</CardTitle>
              <CardDescription>separator.tsx</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Separator />
              <div className="flex h-10 items-center gap-4">
                <span className="text-sm text-muted-foreground">Left</span>
                <Separator orientation="vertical" />
                <span className="text-sm text-muted-foreground">Right</span>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Accordion</CardTitle>
              <CardDescription>accordion.tsx</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="space-y-2">
                <AccordionItem value="a">
                  <AccordionTrigger>First item</AccordionTrigger>
                  <AccordionContent>Content of the first item.</AccordionContent>
                </AccordionItem>
                <AccordionItem value="b">
                  <AccordionTrigger>Second item</AccordionTrigger>
                  <AccordionContent>Content of the second item.</AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sheet</CardTitle>
              <CardDescription>
                sheet.tsx — Radix Dialog underneath, styled as a left-edge drawer (used for the mobile nav in
                app-shell.tsx). Try the trigger below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">Open sheet</Button>
                </SheetTrigger>
                <SheetContent>
                  <h3 className="font-display text-lg font-bold">Sheet content</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Anything can go here — this is just the Sheet/SheetTrigger/SheetContent/SheetClose primitives at
                    work, unstyled beyond what sheet.tsx already provides.
                  </p>
                </SheetContent>
              </Sheet>
            </CardContent>
          </Card>
        </div>
      </Section>
    </div>
  );
}
