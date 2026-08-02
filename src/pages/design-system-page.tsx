import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  CircleAlert,
  Film,
  Info,
  LayoutGrid,
  LoaderCircle,
  Menu,
  Moon,
  Plus,
  Search,
  Sparkles,
  Sun,
  Trash2,
  Tv,
} from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton, HeroSkeleton } from "@/components/states/loading-skeletons";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { FilterBar } from "@/components/media/filter-bar";
import { LoadMoreButton } from "@/components/media/load-more-button";
import { ProgressBar } from "@/components/media/progress-bar";
import { SearchBar } from "@/components/media/search-bar";
import { SectionHeader } from "@/components/media/section-header";
import { StatCard } from "@/components/media/stat-card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  type SheetSide,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tile } from "@/components/ui/tile";
import { usePreferences } from "@/features/preferences/use-preferences";
import { COLOR_PRESETS, type AccentColor, type ColorPreset } from "@/shared/constants/colors";
import { cn } from "@/shared/lib/cn";

import {
  accessibilityChecklist,
  badgeVariants,
  breakpoints,
  buttonSizes,
  buttonVariants,
  componentInventory,
  componentStateModel,
  contributionChecklist,
  iconSizes,
  lineTokens,
  motionTokens,
  navSections,
  radii,
  semanticColorGroups,
  semanticColorUsage,
  shadows,
  sheetSides,
  sheetSizes,
  spacingSteps,
  surfaceHierarchy,
  tintScale,
  typeFamilies,
  typeRoles,
  zIndexScale,
} from "@/pages/design-system/catalog-data";
import {
  AccentPresetCard,
  ColorSwatch,
  ComponentSpec,
  CoverageBadge,
  Guidance,
  PrincipleCard,
  Section,
  Subsection,
  TokenTile,
} from "@/pages/design-system/catalog-primitives";

// Internal developer tool. The route is registered only in development.
// This page intentionally documents the implementation in English so token,
// prop and source-file names match the code exactly.

const navSectionIds = navSections.map((section) => section.id);

const sheetSideIcons: Record<SheetSide, typeof ArrowRight> = {
  left: ArrowLeft,
  right: ArrowRight,
  top: ArrowUp,
  bottom: ArrowDown,
};

const tintClasses: Record<(typeof tintScale)[number]["value"], string> = {
  "[0.02]": "bg-foreground/[0.02]",
  "[0.03]": "bg-foreground/[0.03]",
  "[0.04]": "bg-foreground/[0.04]",
  "5": "bg-foreground/5",
  "[0.06]": "bg-foreground/[0.06]",
  "[0.08]": "bg-foreground/[0.08]",
  "10": "bg-foreground/10",
  "20": "bg-foreground/20",
};

function useActiveSection(sectionIds: readonly string[]) {
  const [activeSection, setActiveSection] = useState(sectionIds[0] ?? "");
  const stableSectionIds = useMemo(() => [...sectionIds], [sectionIds]);

  useEffect(() => {
    const sections = stableSectionIds
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
  }, [stableSectionIds]);

  return activeSection;
}

function RuleTable({ columns, rows }: { columns: string[]; rows: { key: string; cells: React.ReactNode[] }[] }) {
  return (
    <div className="overflow-x-auto rounded-panel border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-foreground/5">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-border/60 align-top">
              {row.cells.map((cell, index) => (
                <td
                  key={`${row.key}-${index}`}
                  className="px-4 py-3 leading-6 text-muted-foreground first:text-foreground"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-semibold text-foreground">
      {children}
    </label>
  );
}

export function DesignSystemPage() {
  const preferences = usePreferences();
  const theme = preferences.data?.theme ?? "dark";
  const accent = preferences.data?.accentColor ?? "violet";
  const activePreset = COLOR_PRESETS[accent];
  const activeSection = useActiveSection(navSectionIds);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryGroup, setInventoryGroup] = useState("all");
  const [patternFilter, setPatternFilter] = useState<"all" | "movies" | "series">("all");
  const [patternSearch, setPatternSearch] = useState("");
  const refreshKey = `${theme}:${accent}`;
  const semanticPairCount = semanticColorGroups.reduce((total, group) => total + group.pairs.length, 0);
  const inventoryGroups = useMemo(() => Array.from(new Set(componentInventory.map((item) => item.group))).sort(), []);
  const filteredInventory = useMemo(() => {
    const normalizedQuery = inventoryQuery.trim().toLowerCase();

    return componentInventory.filter((item) => {
      const matchesGroup = inventoryGroup === "all" || item.group === inventoryGroup;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [item.name, item.source, item.layer, item.purpose].some((value) =>
          value.toLowerCase().includes(normalizedQuery)
        );
      return matchesGroup && matchesQuery;
    });
  }, [inventoryGroup, inventoryQuery]);
  const liveComponentCount = componentInventory.filter((item) => item.coverage === "live").length;

  return (
    <div className="space-y-14 pb-20">
      <header className="relative overflow-hidden rounded-hero border border-border bg-card/60 p-6 shadow-elevation-sm sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <p className="text-overline uppercase text-primary/80">CineTrack · internal developer tool</p>
          <h1 className="mt-3 max-w-4xl font-display text-display-title font-bold sm:text-display-hero">
            Design system
          </h1>
          <p className="mt-4 max-w-3xl text-body leading-7 text-muted-foreground">
            A living reference for the decisions behind CineTrack: foundations, semantic tokens, component contracts,
            product patterns and accessibility requirements. It documents the implementation instead of duplicating it.
          </p>

          <div className="section-rule mt-7 max-w-2xl" aria-hidden="true" />

          <dl className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-card border border-border/70 bg-foreground/[0.03] p-4">
              <dt className="text-xs text-muted-foreground">Theme</dt>
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
              <dt className="text-xs text-muted-foreground">Accent reference</dt>
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
              <dt className="text-xs text-muted-foreground">Semantic pairs</dt>
              <dd className="mt-1 text-sm font-semibold">{semanticPairCount} live contrast checks</dd>
            </div>
            <div className="rounded-card border border-border/70 bg-foreground/[0.03] p-4">
              <dt className="text-xs text-muted-foreground">Component coverage</dt>
              <dd className="mt-1 text-sm font-semibold">
                {componentInventory.length} indexed · {liveComponentCount} live
              </dd>
            </div>
            <div className="rounded-card border border-border/70 bg-foreground/[0.03] p-4">
              <dt className="text-xs text-muted-foreground">Documentation</dt>
              <dd className="mt-1 font-mono text-xs font-semibold">docs/design-system.md</dd>
            </div>
          </dl>
        </div>
      </header>

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
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
        id="overview"
        eyebrow="System model"
        title="Principles & architecture"
        description="The system follows a layered token model used by mature design systems: raw references feed semantic roles, roles feed component recipes, and recipes compose into product patterns."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PrincipleCard index="01" title="Cinematic, not ornamental">
            Visual character comes from typography, rhythm, media and restrained glow—not from adding a unique treatment
            to every screen.
          </PrincipleCard>
          <PrincipleCard index="02" title="Role before value">
            Product code asks for <code className="font-mono text-xs">primary</code> or{" "}
            <code className="font-mono text-xs">success</code>, never a remembered HSL value.
          </PrincipleCard>
          <PrincipleCard index="03" title="Accessible by default">
            Contrast, focus, reduced motion and explicit feedback are component contracts rather than optional polish.
          </PrincipleCard>
          <PrincipleCard index="04" title="Compose before creating">
            New UI starts with existing primitives and patterns. A new variant must represent repeatable product
            meaning.
          </PrincipleCard>
        </div>

        <Subsection
          title="Token flow"
          description="Each layer reduces freedom while increasing meaning and consistency."
        >
          <div className="grid gap-3 lg:grid-cols-4">
            {[
              {
                step: "1",
                title: "Reference",
                code: "COLOR_PRESETS.violet.dark",
                body: "Raw reusable values. They describe what a value is, not where it is used.",
              },
              {
                step: "2",
                title: "Semantic",
                code: "--primary / --background",
                body: "Role-based aliases that adapt to theme, user accent and product meaning.",
              },
              {
                step: "3",
                title: "Component",
                code: "buttonVariants({ variant })",
                body: "Recipes that combine semantic color, type, spacing, shape and state behavior.",
              },
              {
                step: "4",
                title: "Pattern",
                code: "EmptyState / media card",
                body: "Product-level compositions with content rules and interaction intent.",
              },
            ].map((layer, index) => (
              <div key={layer.title} className="relative rounded-panel border border-border bg-card/40 p-5">
                {index < 3 ? (
                  <ArrowRight
                    className="absolute -right-5 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-muted-foreground lg:block"
                    aria-hidden="true"
                  />
                ) : null}
                <p className="font-mono text-xs text-primary">Layer {layer.step}</p>
                <h3 className="mt-2 font-display text-lg font-bold">{layer.title}</h3>
                <code className="mt-3 block break-words rounded-lg bg-foreground/5 p-2 font-mono text-[10px] text-muted-foreground">
                  {layer.code}
                </code>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{layer.body}</p>
              </div>
            ))}
          </div>
        </Subsection>

        <Guidance>
          <strong className="text-foreground">Sources of truth:</strong> theme values live in{" "}
          <code className="font-mono text-xs">src/styles/index.css</code>, Tailwind aliases in{" "}
          <code className="font-mono text-xs">tailwind.config.ts</code>, accent references in{" "}
          <code className="font-mono text-xs">src/shared/constants/colors.ts</code>, and component recipes in{" "}
          <code className="font-mono text-xs">src/components/ui</code>.
        </Guidance>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="color-primitives"
        eyebrow="Foundation"
        title="Color primitives"
        description="Reference colors are raw reusable values. They may feed semantic tokens, but feature and component code should not consume them directly."
      >
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <Guidance tone="good">
            <strong>Do:</strong> map <code className="font-mono text-xs">reference.accent.violet.dark</code> to the
            semantic <code className="font-mono text-xs">--primary</code> role through the theme controller.
          </Guidance>
          <Guidance tone="bad">
            <strong>Avoid:</strong> copying <code className="font-mono text-xs">252 80% 70%</code> into a feature
            component because it “looks primary.”
          </Guidance>
        </div>

        <Subsection
          title="Accent reference palette"
          description="These are the only explicit reference-color families currently formalized. Each has a dark-theme and light-theme value selected for readable primary controls."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.entries(COLOR_PRESETS) as [AccentColor, ColorPreset][]).map(([key, preset]) => (
              <AccentPresetCard key={key} accent={key} preset={preset} selected={key === accent} />
            ))}
          </div>
        </Subsection>

        <Guidance>
          <strong className="text-foreground">Current maturity:</strong> neutral and feedback colors are still authored
          directly as semantic theme values rather than through a complete tonal palette. Keep that distinction visible;
          do not invent fake primitive scales until the product needs systematic tone generation or more themes.
        </Guidance>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="semantic-colors"
        eyebrow="Foundation"
        title="Semantic colors"
        description="Semantic colors describe purpose: canvas, content hierarchy, action importance and feedback. Their values can change by theme without changing component intent."
      >
        <div className="space-y-10">
          {semanticColorGroups.map((group) => (
            <Subsection key={group.title} title={group.title} description={group.description}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {group.pairs.map((pair) => (
                  <ColorSwatch
                    key={pair.bg}
                    label={pair.label}
                    bg={pair.bg}
                    fg={pair.fg}
                    usage={pair.usage}
                    refreshKey={refreshKey}
                  />
                ))}
              </div>
            </Subsection>
          ))}

          <Subsection
            title="Lines & focus"
            description="Boundary roles are documented separately because they are not foreground/background fill pairs."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              {lineTokens.map((token) => (
                <TokenTile key={token.varName} label={token.label} meta={`--${token.varName}`}>
                  <div className="flex h-20 items-center rounded-card bg-card/40 p-3">
                    <div
                      className="h-10 w-full rounded-xl border-2"
                      style={{ borderColor: `hsl(var(--${token.varName}))` }}
                    />
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{token.usage}</p>
                </TokenTile>
              ))}
            </div>
          </Subsection>

          <Subsection title="Usage rules">
            <RuleTable
              columns={["Token", "Use", "Avoid"]}
              rows={semanticColorUsage.map((row) => ({
                key: row.token,
                cells: [<code className="font-mono text-xs">{row.token}</code>, row.use, row.avoid],
              }))}
            />
          </Subsection>
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="typography"
        eyebrow="Foundation"
        title="Typography"
        description="Three families have three distinct jobs. Semantic type roles make hierarchy portable while preserving the cinematic voice."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {typeFamilies.map((family) => (
            <div key={family.name} className="rounded-panel border border-border bg-card/40 p-5">
              <p className={cn("text-3xl", family.sampleClassName)}>Aa Bb Cc</p>
              <p className="mt-4 text-sm font-semibold">{family.name}</p>
              <p className="text-xs text-primary">{family.role}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{family.usage}</p>
            </div>
          ))}
        </div>

        <Subsection
          title="Semantic type roles"
          description="Use role names for new UI; raw Tailwind sizes remain available for legacy and exceptional local composition."
        >
          <div className="space-y-4">
            {typeRoles.map((role) => (
              <div
                key={role.name}
                className="flex flex-col gap-2 border-b border-border/40 pb-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <p
                  className={cn(
                    "min-w-0 break-words",
                    role.className,
                    "display" in role && role.display && "font-display"
                  )}
                >
                  The quick brown fox
                </p>
                <div className="shrink-0 sm:text-right">
                  <p className="font-mono text-xs">text-{role.name}</p>
                  <p className="text-xs text-muted-foreground">{role.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </Subsection>

        <div className="grid gap-4 md:grid-cols-2">
          <Guidance tone="good">
            <strong>Do:</strong> preserve hierarchy with role, weight and spacing. Keep body lines around 55–75
            characters and use sentence case for interface labels.
          </Guidance>
          <Guidance tone="bad">
            <strong>Avoid:</strong> Syne for paragraphs, Playfair for generic headings, all-caps body copy, or size
            alone as the only hierarchy signal.
          </Guidance>
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="layout"
        eyebrow="Foundation"
        title="Spacing, layout & density"
        description="CineTrack uses Tailwind's 4px-based spacing scale rather than a parallel custom vocabulary. Layout decisions combine that scale with responsive composition and optional compact density."
      >
        <Subsection title="Spacing scale">
          <div className="space-y-2 rounded-panel border border-border bg-card/30 p-5">
            {spacingSteps.map((step) => (
              <div key={step} className="flex items-center gap-4">
                <span className="w-48 shrink-0 font-mono text-xs text-muted-foreground">
                  p-{step} · {step * 0.25}rem · {step * 4}px
                </span>
                <div className="h-3 rounded-full bg-primary/60" style={{ width: `${step * 0.25}rem` }} />
              </div>
            ))}
          </div>
        </Subsection>

        <Subsection
          title="Breakpoints"
          description="Tailwind's default screens — not reinvented, same reasoning as the spacing scale above."
        >
          <RuleTable
            columns={["Token", "Width", "Where it matters"]}
            rows={breakpoints.map((breakpoint) => ({
              key: breakpoint.name,
              cells: [
                <code className="font-mono text-xs">{breakpoint.name}:</code>,
                breakpoint.value,
                breakpoint.usage,
              ],
            }))}
          />
        </Subsection>

        <div className="grid gap-4 lg:grid-cols-3">
          <PrincipleCard index="Layout" title="Responsive composition">
            Prefer natural wrapping, grid and max-width constraints. Breakpoints change composition—not merely shrink
            every dimension.
          </PrincipleCard>
          <PrincipleCard index="Rhythm" title="Consistent grouping">
            Use smaller gaps within a component, medium gaps between related groups, and the largest gaps between page
            sections.
          </PrincipleCard>
          <PrincipleCard index="Density" title="Compact mode">
            The <code className="font-mono text-xs">.compact</code> root scales rem-based spacing and type to 90%.
            Components should avoid pixel literals that bypass it.
          </PrincipleCard>
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="shape"
        eyebrow="Foundation"
        title="Shape & surface hierarchy"
        description="Radius communicates scale and nesting. Larger containers receive larger radii; nested controls should usually step down."
      >
        <Subsection title="Radius scale">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
            {radii.map((radius) => (
              <TokenTile key={radius.name} label={radius.name} meta={`rounded-${radius.name}`}>
                <div className={cn("h-24 w-full border border-primary/30 bg-primary/15", radius.className)} />
                <p className="text-xs leading-5 text-muted-foreground">{radius.usage}</p>
              </TokenTile>
            ))}
          </div>
        </Subsection>

        <Subsection
          title="Surface taxonomy"
          description="Choose a surface by structural role, not by whichever background appears attractive."
        >
          <RuleTable
            columns={["Surface", "Recipe", "Use"]}
            rows={surfaceHierarchy.map((surface) => ({
              key: surface.name,
              cells: [surface.name, <code className="font-mono text-xs">{surface.recipe}</code>, surface.usage],
            }))}
          />
        </Subsection>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="elevation"
        eyebrow="Foundation"
        title="Elevation, tint & stacking"
        description="Depth should explain hierarchy. Shadows represent physical separation; primary glow represents emphasis. They are not interchangeable."
      >
        <Subsection title="Elevation scale">
          <div className="grid grid-cols-2 gap-6 rounded-panel bg-foreground/5 p-6 sm:grid-cols-3 xl:grid-cols-6">
            {shadows.map((shadow) => (
              <TokenTile key={shadow.name} label={shadow.name} meta={shadow.usage}>
                <div className={cn("h-24 w-full rounded-panel bg-card", shadow.className)} />
              </TokenTile>
            ))}
          </div>
        </Subsection>

        <Subsection
          title="Theme-aware tint"
          description="Foreground opacity creates a contrast overlay that self-inverts across themes, replacing duplicated black/light and white/dark utility pairs."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tintScale.map((tier) => (
              <div key={tier.value} className="rounded-card border border-border p-3">
                <div className={cn("h-16 rounded-xl border border-border", tintClasses[tier.value])} />
                <p className="mt-3 font-mono text-xs">bg-foreground/{tier.value}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{tier.usage}</p>
              </div>
            ))}
          </div>
        </Subsection>

        <Subsection title="Z-index scale">
          <RuleTable
            columns={["Token", "Value", "Use"]}
            rows={zIndexScale.map((tier) => ({
              key: tier.name,
              cells: [<code className="font-mono text-xs">z-{tier.name}</code>, tier.value, tier.usage],
            }))}
          />
        </Subsection>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="motion"
        eyebrow="Foundation"
        title="Motion"
        description="Motion explains cause, continuity and hierarchy. It should feel responsive first and cinematic only where the product moment earns it."
      >
        <div className="space-y-3">
          {motionTokens.map((token) => (
            <div
              key={token.name}
              className="grid gap-3 rounded-card border border-border p-3 md:grid-cols-[150px_1fr_280px] md:items-center"
            >
              <div>
                <p className="font-mono text-xs">
                  {token.name} · {token.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{token.usage}</p>
              </div>
              <button
                type="button"
                className="group h-10 w-full overflow-hidden rounded-full bg-foreground/5 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`Preview ${token.name} motion token`}
              >
                <div
                  className={cn(
                    "h-full w-10 rounded-full bg-primary transition-transform ease-out-expo group-hover:translate-x-[calc(100%-2.5rem)] group-focus-visible:translate-x-[calc(100%-2.5rem)]",
                    token.className
                  )}
                />
              </button>
              <code className="font-mono text-[10px] text-muted-foreground">duration-{token.name} · ease-out-expo</code>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Guidance tone="good">
            <strong>Do:</strong> animate opacity and transform, keep micro-interactions under 300ms, and preserve the
            final state when motion is reduced.
          </Guidance>
          <Guidance tone="bad">
            <strong>Avoid:</strong> decorative looping near reading content, layout-shifting animation, or motion as the
            only explanation of state change.
          </Guidance>
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="iconography"
        eyebrow="Foundation"
        title="Iconography"
        description="Lucide is the shared icon family. Icons inherit currentColor, use consistent optical sizes and support text rather than replacing it without an accessible name."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {iconSizes.map((icon) => (
            <div key={icon.size} className="rounded-panel border border-border bg-card/40 p-5">
              <div className="flex h-20 items-center justify-center rounded-card bg-foreground/5 text-primary">
                <Film className={icon.className} aria-hidden="true" />
              </div>
              <p className="mt-3 font-mono text-xs">
                {icon.size}px · {icon.className}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{icon.usage}</p>
            </div>
          ))}
        </div>

        <div
          className="flex flex-wrap gap-3 rounded-panel border border-border bg-card/30 p-5"
          aria-label="Common icon examples"
        >
          {[Search, Plus, Check, Info, AlertTriangle, Trash2, Menu, LayoutGrid, Film, Tv, Sparkles].map(
            (Icon, index) => (
              <div
                key={index}
                className="flex size-11 items-center justify-center rounded-xl border border-border bg-background"
                aria-hidden="true"
              >
                <Icon className="size-5" />
              </div>
            )
          )}
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="accessibility"
        eyebrow="Quality contract"
        title="Accessibility"
        description="Accessibility is part of every token and component API. The catalog exposes live contrast and representative keyboard, status and reduced-motion expectations."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {accessibilityChecklist.map((item) => (
            <div key={item} className="flex gap-3 rounded-card border border-border bg-card/30 p-4">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                <CheckCircle2 className="size-4" aria-hidden="true" />
              </span>
              <p className="text-sm leading-6 text-muted-foreground">{item}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel tone="subtle">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Focus</p>
            <Button className="mt-4" variant="outline">
              Tab to inspect focus
            </Button>
          </Panel>
          <Panel tone="subtle">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status + text</p>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <span className="flex size-6 items-center justify-center rounded-full bg-warning text-warning-foreground">
                <CircleAlert className="size-4" aria-hidden="true" />
              </span>
              <span>Metadata needs attention</span>
            </div>
          </Panel>
          <Panel tone="subtle">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reduced motion</p>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              CSS and Framer Motion both consume the same preference; OS-level{" "}
              <code className="font-mono text-xs">prefers-reduced-motion</code> remains honored.
            </p>
          </Panel>
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="inventory"
        eyebrow="Coverage"
        title="Complete component inventory"
        description="Every React component source file is indexed here. Live showcase means the component can be rendered safely in isolation; API reference covers context-bound feature components; internal marks providers and controllers that have no standalone visual state."
      >
        <div className="grid gap-4 rounded-panel border border-border bg-card/30 p-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="component-inventory-search">Search the catalog</FieldLabel>
            <Input
              id="component-inventory-search"
              type="search"
              value={inventoryQuery}
              onChange={(event) => setInventoryQuery(event.target.value)}
              placeholder="Button, media, loading, settings…"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="component-inventory-group">Component group</FieldLabel>
            <Select
              id="component-inventory-group"
              value={inventoryGroup}
              onChange={(event) => setInventoryGroup(event.target.value)}
              className="w-full"
            >
              <option value="all">All groups</option>
              {inventoryGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{filteredInventory.length} components shown</span>
          <CoverageBadge coverage="live" />
          <CoverageBadge coverage="reference" />
          <CoverageBadge coverage="internal" />
        </div>

        {filteredInventory.length === 0 ? (
          <EmptyState
            className="rounded-panel border border-border bg-foreground/[0.02] py-12"
            icon={Search}
            title="No component found"
            description="Try a component name, source path, layer or product responsibility."
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setInventoryQuery("");
                  setInventoryGroup("all");
                }}
              >
                Reset filters
              </Button>
            }
          />
        ) : (
          <div className="space-y-8">
            {inventoryGroups
              .filter((group) => filteredInventory.some((item) => item.group === group))
              .map((group) => {
                const items = filteredInventory.filter((item) => item.group === group);

                return (
                  <Subsection
                    key={group}
                    title={`${group} · ${items.length}`}
                    description="Source-level coverage is guarded by a test: adding a component file without adding it to this inventory fails the catalog test."
                  >
                    <RuleTable
                      columns={["Component", "Layer", "Coverage", "Responsibility"]}
                      rows={items.map((item) => ({
                        key: item.source,
                        cells: [
                          <div key={`${item.source}-name`}>
                            <p className="font-semibold text-foreground">{item.name}</p>
                            <code className="font-mono text-[10px] text-muted-foreground">{item.source}</code>
                          </div>,
                          <Badge key={`${item.source}-layer`} variant="outline">
                            {item.layer}
                          </Badge>,
                          <CoverageBadge key={`${item.source}-coverage`} coverage={item.coverage} />,
                          item.purpose,
                        ],
                      }))}
                    />
                  </Subsection>
                );
              })}
          </div>
        )}
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="components"
        eyebrow="Library"
        title="Components & variants"
        description="The component catalog documents API, intent, anatomy, variants, sizes and states. Demos use the real components imported from src/components/ui."
      >
        <Subsection
          title="Shared interaction-state model"
          description="Mature systems document states as part of the component contract, not as incidental CSS. Not every state applies to every component, but every applicable state must be deliberate."
        >
          <RuleTable
            columns={["State", "Applies to", "Contract"]}
            rows={componentStateModel.map((item) => ({
              key: item.state,
              cells: [<strong>{item.state}</strong>, item.appliesTo, item.expectation],
            }))}
          />
        </Subsection>

        <Subsection title="Actions">
          <ComponentSpec
            name="Button"
            source="components/ui/button.tsx"
            description="Triggers an action or navigates when composed with asChild. Visual variants express action hierarchy and risk."
            anatomy={["container", "optional leading icon", "label", "optional trailing icon"]}
            variants={buttonVariants.map((variant) => variant.name)}
            states={["enabled", "hover", "focus-visible", "pressed", "disabled", "loading / busy"]}
            guidance="A user can act immediately. Use links for navigation semantics, composed through asChild when button styling is required."
            accessibility="Use a visible label whenever possible. Icon-only buttons require an accessible name; loading actions expose aria-busy and prevent duplicate submission."
            className="lg:col-span-2"
          >
            <div className="space-y-6">
              <RuleTable
                columns={["Variant", "Small", "Default", "Large", "Icon"]}
                rows={buttonVariants.map((variant) => ({
                  key: variant.name,
                  cells: [
                    <div key={`${variant.name}-label`}>
                      <p className="font-semibold text-foreground">{variant.name}</p>
                      <p className="mt-1 max-w-48 text-xs leading-5 text-muted-foreground">{variant.use}</p>
                    </div>,
                    <Button key={`${variant.name}-sm`} variant={variant.name} size="sm">
                      Action
                    </Button>,
                    <Button key={`${variant.name}-default`} variant={variant.name}>
                      <Sparkles className="size-4" /> Action
                    </Button>,
                    <Button key={`${variant.name}-lg`} variant={variant.name} size="lg">
                      Action
                    </Button>,
                    <Button
                      key={`${variant.name}-icon`}
                      variant={variant.name}
                      size="icon"
                      aria-label={`${variant.name} add action`}
                    >
                      {variant.name === "destructive" ? <Trash2 className="size-4" /> : <Plus className="size-4" />}
                    </Button>,
                  ],
                }))}
              />

              <RuleTable
                columns={["Size", "Footprint", "Use"]}
                rows={buttonSizes.map((size) => ({
                  key: size.name,
                  cells: [<code className="font-mono text-xs">{size.name}</code>, size.meta, size.use],
                }))}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small</Button>
                <Button>Default</Button>
                <Button size="lg">Large</Button>
                <Button size="icon" aria-label="Add item">
                  <Plus className="size-4" />
                </Button>
                <Button disabled>Disabled</Button>
                <Button disabled aria-busy="true">
                  <LoaderCircle className="size-4 animate-spin" /> Loading
                </Button>
                <Button asChild variant="outline">
                  <a href="#contribution">asChild link</a>
                </Button>
              </div>
            </div>
          </ComponentSpec>
        </Subsection>

        <Subsection title="Status & metadata">
          <ComponentSpec
            name="Badge"
            source="components/ui/badge.tsx"
            description="Compact, non-interactive metadata or status label. Semantic feedback variants use solid paired foreground tokens."
            anatomy={["optional icon", "short label"]}
            variants={badgeVariants.map((variant) => variant)}
            states={["static metadata", "status with icon", "media type"]}
            guidance="Label status, category or media type. Use a Button or filter control when the element is interactive."
            accessibility="Badges do not receive focus. Status variants pair color with a concise word and, for important feedback, an icon or surrounding message."
          >
            <div className="flex flex-wrap gap-2">
              {badgeVariants.map((variant) => (
                <Badge key={variant} variant={variant}>
                  {variant === "success" ? <Check className="mr-1 size-3" /> : null}
                  {variant === "warning" ? <AlertTriangle className="mr-1 size-3" /> : null}
                  {variant === "destructive" ? <CircleAlert className="mr-1 size-3" /> : null}
                  {variant}
                </Badge>
              ))}
            </div>
          </ComponentSpec>
        </Subsection>

        <Subsection title="Forms">
          <div className="grid gap-5 lg:grid-cols-3">
            <ComponentSpec
              name="Input"
              source="components/ui/input.tsx"
              description="Native single-line control with prominent and compact density variants. Labels, helper copy and errors are composed around it."
              anatomy={["label", "input", "optional helper", "optional error"]}
              variants={["default · 44px", "sm · 40px"]}
              states={["empty", "filled", "read-only", "disabled", "invalid", "focus-visible"]}
              guidance="Collect a short free-form value such as a title, year, query or token."
              accessibility="Associate labels with htmlFor/id and helper or error copy with aria-describedby. Use aria-invalid only when the current value has failed validation."
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="catalog-input-default">Default</FieldLabel>
                  <Input id="catalog-input-default" placeholder="Search your library" />
                  <p className="text-xs text-muted-foreground">Prominent · 44px touch target</p>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="catalog-input-compact">Compact</FieldLabel>
                  <Input id="catalog-input-compact" size="sm" defaultValue="Dense desktop form" />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="catalog-input-readonly">Read-only</FieldLabel>
                  <Input id="catalog-input-readonly" readOnly value="tt0133093" aria-describedby="readonly-help" />
                  <p id="readonly-help" className="text-xs text-muted-foreground">
                    Selectable and copyable; visually distinct from disabled.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="catalog-input-disabled">Disabled</FieldLabel>
                  <Input id="catalog-input-disabled" disabled value="Unavailable" />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="catalog-input-invalid">Invalid</FieldLabel>
                  <Input
                    id="catalog-input-invalid"
                    aria-invalid="true"
                    aria-describedby="catalog-input-error"
                    defaultValue="999"
                  />
                  <p id="catalog-input-error" className="flex items-center gap-1 text-xs text-destructive">
                    <CircleAlert className="size-3" aria-hidden="true" /> Enter a year between 1888 and today.
                  </p>
                </div>
              </div>
            </ComponentSpec>

            <ComponentSpec
              name="Select"
              source="components/ui/select.tsx"
              description="Native single-choice control with platform-correct keyboard and screen-reader behavior."
              anatomy={["label", "select", "options", "optional helper or error"]}
              states={["enabled", "selected", "focus-visible", "disabled", "invalid"]}
              guidance="Choose exactly one value from a short, stable set. Prefer a searchable pattern for long or dynamic lists."
              accessibility="Keep a meaningful selected value, preserve native option semantics and associate validation copy with aria-describedby."
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="catalog-select-default">Default</FieldLabel>
                  <Select id="catalog-select-default" defaultValue="all" className="w-full">
                    <option value="all">Movies and series</option>
                    <option value="movies">Movies</option>
                    <option value="series">Series</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="catalog-select-disabled">Disabled</FieldLabel>
                  <Select id="catalog-select-disabled" disabled defaultValue="movies" className="w-full">
                    <option value="movies">Movies</option>
                  </Select>
                  <p className="text-xs text-muted-foreground">Explain why a disabled choice cannot be changed.</p>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="catalog-select-invalid">Invalid</FieldLabel>
                  <Select
                    id="catalog-select-invalid"
                    aria-invalid="true"
                    aria-describedby="catalog-select-error"
                    defaultValue=""
                    className="w-full"
                  >
                    <option value="" disabled>
                      Choose a provider
                    </option>
                    <option value="netflix">Netflix</option>
                    <option value="canal">Canal+</option>
                  </Select>
                  <p id="catalog-select-error" className="flex items-center gap-1 text-xs text-destructive">
                    <CircleAlert className="size-3" aria-hidden="true" /> Select one provider.
                  </p>
                </div>
              </div>
            </ComponentSpec>

            <ComponentSpec
              name="Textarea"
              source="components/ui/textarea.tsx"
              description="Native multi-line control for private notes and longer user-authored content."
              anatomy={["label", "textarea", "optional character guidance", "optional error"]}
              states={["empty", "filled", "read-only", "disabled", "invalid", "focus-visible"]}
              guidance="Collect content that genuinely benefits from multiple lines; do not use it for a short label or query."
              accessibility="Keep the label persistent, avoid placeholder-only instructions and provide length limits before submission."
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="catalog-textarea-default">Default</FieldLabel>
                  <Textarea id="catalog-textarea-default" className="min-h-28" placeholder="Add private notes…" />
                  <p className="text-xs text-muted-foreground">Keep helper copy actionable and concise.</p>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="catalog-textarea-readonly">Read-only</FieldLabel>
                  <Textarea
                    id="catalog-textarea-readonly"
                    className="min-h-24"
                    readOnly
                    value="Imported from a previous backup."
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="catalog-textarea-disabled">Disabled</FieldLabel>
                  <Textarea id="catalog-textarea-disabled" className="min-h-20" disabled value="Editing is locked." />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="catalog-textarea-invalid">Invalid</FieldLabel>
                  <Textarea
                    id="catalog-textarea-invalid"
                    className="min-h-24"
                    aria-invalid="true"
                    aria-describedby="catalog-textarea-error"
                    defaultValue="x"
                  />
                  <p id="catalog-textarea-error" className="flex items-center gap-1 text-xs text-destructive">
                    <CircleAlert className="size-3" aria-hidden="true" /> Add at least ten characters.
                  </p>
                </div>
              </div>
            </ComponentSpec>
          </div>
        </Subsection>

        <Subsection title="Containers">
          <div className="grid gap-5 lg:grid-cols-3">
            <ComponentSpec
              name="Card"
              source="components/ui/card.tsx"
              description="Independent glass-like content module with default padding and elevation."
              anatomy={["Card", "CardHeader", "CardTitle", "CardDescription", "CardContent"]}
              variants={["full anatomy", "header + content", "content only"]}
              guidance="Content has its own identity and benefits from separation from the page canvas."
              accessibility="Use semantic headings inside the card and avoid making the whole surface clickable when it contains nested controls."
            >
              <Card>
                <CardHeader>
                  <CardTitle>Recently watched</CardTitle>
                  <CardDescription>Card header and supporting copy.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Card content uses a default top margin.</p>
                </CardContent>
              </Card>
            </ComponentSpec>

            <ComponentSpec
              name="Panel"
              source="components/ui/panel.tsx"
              description="Flat grouped surface with card and subtle tones, plus asChild composition."
              anatomy={["container", "caller-owned content"]}
              variants={["tone=card", "tone=subtle", "asChild composition"]}
              guidance="Group related content without the visual weight and blur of Card."
              accessibility="Panel is structural, not interactive. Preserve the semantics of the composed element when using asChild."
            >
              <div className="space-y-3">
                <Panel>
                  <p className="text-sm font-medium">tone="card"</p>
                </Panel>
                <Panel tone="subtle">
                  <p className="text-sm font-medium">tone="subtle"</p>
                </Panel>
              </div>
            </ComponentSpec>

            <ComponentSpec
              name="Tile"
              source="components/ui/tile.tsx"
              description="Minimal bordered box with no built-in fill or padding."
              anatomy={["container", "caller-owned spacing"]}
              variants={["plain", "tinted", "asChild composition"]}
              guidance="Dense rows, small nested objects and local metadata blocks."
              accessibility="Tile is a visual recipe only. Use a link or button through asChild when the entire tile is interactive."
            >
              <div className="space-y-2">
                <Tile className="flex items-center justify-between bg-foreground/[0.03] px-3 py-2 text-sm">
                  <span>Episodes</span>
                  <strong>10</strong>
                </Tile>
                <Tile className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>Runtime</span>
                  <span className="text-muted-foreground">2h 17m</span>
                </Tile>
              </div>
            </ComponentSpec>
          </div>
        </Subsection>

        <Subsection title="Structure">
          <ComponentSpec
            name="Separator"
            source="components/ui/separator.tsx"
            description="Decorative divider that groups related regions without adding another container surface."
            anatomy={["single visual rule"]}
            variants={["horizontal", "vertical"]}
            states={["decorative only"]}
            guidance="Clarify grouping when spacing alone is insufficient. Avoid stacking separators and borders for the same boundary."
            accessibility="The primitive is decorative and intentionally hidden from the accessibility tree. Use a semantic heading or landmark when users need structural navigation."
          >
            <div className="space-y-6">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Horizontal</p>
                <div className="space-y-3 rounded-card border border-border bg-background/50 p-4 text-sm">
                  <span>Metadata</span>
                  <Separator />
                  <span>Availability</span>
                  <Separator className="bg-primary/30" />
                  <span>Recommendations</span>
                </div>
              </div>
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vertical</p>
                <div className="flex h-12 items-center gap-4 rounded-card border border-border bg-background/50 p-4 text-sm">
                  <span>Movie</span>
                  <Separator orientation="vertical" />
                  <span>2026</span>
                  <Separator orientation="vertical" className="bg-primary/30" />
                  <span>142 min</span>
                </div>
              </div>
            </div>
          </ComponentSpec>
        </Subsection>

        <Subsection title="Feedback & loading">
          <div className="grid gap-5 lg:grid-cols-2">
            <ComponentSpec
              name="Progress"
              source="components/ui/progress.tsx"
              description="Accessible Radix progress primitive for determinate completion."
              anatomy={["track", "indicator"]}
              variants={["default indicator", "semantic indicator via indicatorClassName"]}
              states={["0%", "in progress", "complete"]}
              guidance="A bounded operation has measurable completion. Use Skeleton when duration or progress is unknown."
              accessibility="Provide a nearby text label and keep the numeric value synchronized with the visual indicator."
            >
              <div className="space-y-5">
                {[0, 25, 60, 90].map((value) => (
                  <div key={value} className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">{value}%</p>
                    <Progress value={value} />
                  </div>
                ))}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">100% · semantic indicator (indicatorClassName)</p>
                  <Progress value={100} indicatorClassName="bg-success" />
                </div>
              </div>
            </ComponentSpec>

            <ComponentSpec
              name="Skeleton"
              source="components/ui/skeleton.tsx"
              description="Shape-preserving loading placeholder with reduced-motion support inherited from the root gate."
              anatomy={["placeholder shape", "shimmer layer"]}
              variants={["text", "avatar", "media", "composed page skeleton"]}
              states={["loading", "reduced motion"]}
              guidance="Content structure is known but data is still loading. Mirror the final geometry to reduce layout shift."
              accessibility="Skeletons are visual placeholders, not status messages. Announce loading on the containing region when users need confirmation."
            >
              <div className="space-y-3">
                <Skeleton className="h-4 w-2/3" />
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <Skeleton className="h-24 w-full" />
              </div>
            </ComponentSpec>
          </div>
        </Subsection>

        <Subsection title="Disclosure & overlays">
          <div className="grid gap-5">
            <ComponentSpec
              name="Accordion"
              source="components/ui/accordion.tsx"
              description="Radix disclosure for optional supporting content. The trigger owns keyboard behavior, focus, expanded state and icon rotation."
              anatomy={["Accordion", "AccordionItem", "AccordionTrigger", "AccordionContent"]}
              variants={["single", "single collapsible", "multiple"]}
              states={["closed", "open", "focus-visible", "disabled item"]}
              guidance="Users need to scan multiple headings and open a small subset. Keep critical content visible by default."
              accessibility="The trigger remains a real button with aria-expanded and keyboard support. Headings should stay concise and describe the hidden content."
            >
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Single · collapsible
                  </p>
                  <Accordion type="single" collapsible defaultValue="guidance" className="space-y-2">
                    <AccordionItem value="guidance">
                      <AccordionTrigger>Component guidance</AccordionTrigger>
                      <AccordionContent>Document usage, variants, states, content and accessibility.</AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="implementation">
                      <AccordionTrigger>Implementation notes</AccordionTrigger>
                      <AccordionContent>
                        Prefer semantic tokens and preserve native interaction semantics.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="disabled" disabled>
                      <AccordionTrigger>Unavailable section</AccordionTrigger>
                      <AccordionContent>This content cannot be opened.</AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Multiple</p>
                  <Accordion type="multiple" defaultValue={["tokens", "testing"]} className="space-y-2">
                    <AccordionItem value="tokens">
                      <AccordionTrigger>Token contract</AccordionTrigger>
                      <AccordionContent>
                        Components consume semantic roles instead of raw palette values.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="testing">
                      <AccordionTrigger>Testing contract</AccordionTrigger>
                      <AccordionContent>Test keyboard behavior, state changes and accessible names.</AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </div>
            </ComponentSpec>

            <ComponentSpec
              name="Sheet"
              source="components/ui/sheet.tsx"
              description="Modal edge-anchored surface built on Radix Dialog. It supports four sides, four sizes, structured header/footer slots, an overlay and an accessible close control."
              anatomy={[
                "Sheet",
                "SheetTrigger",
                "SheetOverlay",
                "SheetContent",
                "SheetHeader",
                "SheetTitle",
                "SheetDescription",
                "SheetFooter",
                "SheetClose",
              ]}
              variants={[
                ...sheetSides.map((side) => `side=${side.name}`),
                ...sheetSizes.map((size) => `size=${size.name}`),
              ]}
              states={["closed", "opening", "open", "closing", "focus trapped", "dismissed"]}
              guidance="Secondary navigation, inspectors, filters or a focused task need temporary modal space without losing page context."
              accessibility="Always provide SheetTitle and normally SheetDescription. Focus is trapped while open and returns to the trigger on close; do not disable the visible close control without another obvious dismissal action."
            >
              <div className="space-y-7">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Edge variants
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {sheetSides.map((side) => {
                      const Icon = sheetSideIcons[side.name];

                      return (
                        <Sheet key={side.name}>
                          <SheetTrigger asChild>
                            <Button variant="outline" className="w-full justify-start">
                              <Icon className="size-4" /> {side.name}
                            </Button>
                          </SheetTrigger>
                          <SheetContent side={side.name}>
                            <SheetHeader>
                              <SheetTitle>{side.name} sheet</SheetTitle>
                              <SheetDescription>{side.use}</SheetDescription>
                            </SheetHeader>
                            <div className="my-6 space-y-3">
                              <Panel tone="subtle">
                                <p className="text-sm font-medium">Context-preserving content</p>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                  Keep the task focused and the information hierarchy shallow.
                                </p>
                              </Panel>
                              <Input aria-label={`${side.name} sheet example field`} placeholder="Example field" />
                            </div>
                            <SheetFooter>
                              <SheetClose asChild>
                                <Button variant="ghost">Cancel</Button>
                              </SheetClose>
                              <SheetClose asChild>
                                <Button>Apply</Button>
                              </SheetClose>
                            </SheetFooter>
                          </SheetContent>
                        </Sheet>
                      );
                    })}
                  </div>
                </div>

                <RuleTable
                  columns={["Side", "Recommended use"]}
                  rows={sheetSides.map((side) => ({
                    key: side.name,
                    cells: [<code className="font-mono text-xs">{side.name}</code>, side.use],
                  }))}
                />

                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Size variants · shown from the right edge
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {sheetSizes.map((size) => (
                      <Sheet key={size.name}>
                        <SheetTrigger asChild>
                          <Button variant="secondary" className="w-full">
                            {size.name}
                          </Button>
                        </SheetTrigger>
                        <SheetContent side="right" size={size.name}>
                          <SheetHeader>
                            <SheetTitle>{size.name} sheet</SheetTitle>
                            <SheetDescription>{size.use}</SheetDescription>
                          </SheetHeader>
                          <div className="my-6 flex-1 rounded-panel border border-dashed border-border p-4 text-sm text-muted-foreground">
                            Available task area
                          </div>
                          <SheetFooter>
                            <SheetClose asChild>
                              <Button>Done</Button>
                            </SheetClose>
                          </SheetFooter>
                        </SheetContent>
                      </Sheet>
                    ))}
                  </div>
                </div>

                <RuleTable
                  columns={["Size", "Recommended use"]}
                  rows={sheetSizes.map((size) => ({
                    key: size.name,
                    cells: [<code className="font-mono text-xs">{size.name}</code>, size.use],
                  }))}
                />
              </div>
            </ComponentSpec>
          </div>
        </Subsection>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="patterns"
        eyebrow="Product language"
        title="Product patterns"
        description="Patterns combine primitives around recurring CineTrack tasks. They include content and behavior guidance that a low-level component cannot encode alone."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <ComponentSpec
            name="Section heading"
            source="components/media/section-header.tsx"
            description="Consistent content-section introduction with optional subtitle, action and stagger index."
            guidance="A page contains multiple scannable media or analytics sections."
            anatomy={["film rule", "title", "optional subtitle", "optional action"]}
          >
            <SectionHeader
              title="Continue watching"
              subtitle="Pick up where you left off"
              action={
                <Button size="sm" variant="ghost">
                  See all
                </Button>
              }
              index={0}
            />
          </ComponentSpec>

          <ComponentSpec
            name="Stats & progress"
            source="components/media/{stat-card,progress-bar}.tsx"
            description="Compact product metrics and media completion, distinct from the generic Radix progress primitive."
            guidance="Show media-specific values where context and completion labels matter."
            anatomy={["label", "value", "helper", "track", "percentage"]}
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <StatCard label="Watched" value="128" helper="movies and series" />
              <div className="space-y-4">
                <ProgressBar value={0} label="Not started" showPercent />
                <ProgressBar value={72} label="Season progress" showPercent />
                <ProgressBar value={100} label="Completed" showPercent />
              </div>
            </div>
          </ComponentSpec>

          <ComponentSpec
            name="Empty state"
            source="components/states/empty-state.tsx"
            description="Explains why content is absent and offers one meaningful recovery or creation action."
            guidance="A valid view has no data. Do not use it for loading or remote failures."
            anatomy={["optional icon", "title", "description", "optional action"]}
          >
            <EmptyState
              className="rounded-panel border border-border bg-foreground/[0.02] py-12"
              icon={Film}
              title="Your watchlist is empty"
              description="Save a movie or series to build a queue for later."
              action={
                <Button>
                  <Plus className="size-4" /> Browse titles
                </Button>
              }
            />
          </ComponentSpec>

          <ComponentSpec
            name="Search & filter controls"
            source="components/media/{search-bar,filter-bar}.tsx"
            description="Product-level query and segmented-filter compositions built from native input and button primitives."
            anatomy={["query field", "search icon", "mutually exclusive filter options"]}
            variants={["empty query", "filled query", "selected filter"]}
            states={["enabled", "focus-visible", "selected"]}
            guidance="A media collection needs quick narrowing without opening a separate form or overlay."
            accessibility="The query remains a labelled input in product usage; filter options are buttons and the selected value must remain programmatically understandable in future API changes."
          >
            <div className="space-y-5">
              <SearchBar
                value={patternSearch}
                onChange={setPatternSearch}
                placeholder="Search titles, people or genres"
              />
              <FilterBar
                value={patternFilter}
                onChange={setPatternFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "movies", label: "Movies" },
                  { value: "series", label: "Series" },
                ]}
              />
              <p className="text-xs text-muted-foreground">
                Current example: <strong className="text-foreground">{patternSearch || "empty query"}</strong> ·{" "}
                {patternFilter}
              </p>
            </div>
          </ComponentSpec>

          <ComponentSpec
            name="Load more"
            source="components/media/load-more-button.tsx"
            description="Accessible pagination fallback that can also act as an infinite-scroll sentinel."
            anatomy={["sentinel", "button", "optional spinner", "label"]}
            variants={["idle", "fetching", "hidden when complete"]}
            states={["enabled", "loading / disabled", "not rendered"]}
            guidance="A large media collection is fetched in pages and users need an explicit keyboard-accessible continuation action."
            accessibility="The visible button remains available even when IntersectionObserver triggers loading automatically. Busy state preserves the label and prevents duplicate fetches."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Panel tone="subtle">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Idle</p>
                <LoadMoreButton hasNextPage isFetchingNextPage={false} onClick={() => undefined} />
              </Panel>
              <Panel tone="subtle">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fetching</p>
                <LoadMoreButton hasNextPage isFetchingNextPage onClick={() => undefined} />
              </Panel>
            </div>
          </ComponentSpec>

          <ComponentSpec
            name="Page loading skeletons"
            source="components/states/loading-skeletons.tsx"
            description="Page-level compositions that mirror the final hero and media-grid geometry."
            anatomy={["HeroSkeleton", "GridSkeleton", "Skeleton primitives"]}
            variants={["hero", "grid with configurable count"]}
            states={["loading", "reduced motion"]}
            guidance="The page layout is known but its remote content has not arrived yet."
            accessibility="Apply a loading label or aria-busy to the containing region when users need an announcement; skeleton shapes themselves remain decorative."
          >
            <div className="space-y-5">
              <HeroSkeleton />
              <GridSkeleton count={4} />
            </div>
          </ComponentSpec>

          <ComponentSpec
            name="Remote error state"
            source="components/states/remote-error-state.tsx"
            description="Maps remote, authentication and local-database failures to plain-language recovery guidance."
            anatomy={["status icon", "contextual title", "description", "retry action", "optional technical details"]}
            variants={["connection", "authentication", "local database"]}
            states={["error", "retry available", "technical details expanded"]}
            guidance="Remote metadata or local persistence failed and the user needs a recovery path distinct from an empty result."
            accessibility="The title and message explain the failure without relying on color; the retry action is a real button and technical details use native disclosure."
          >
            <div className="rounded-panel border border-border bg-foreground/[0.02]">
              <RemoteErrorState error={new Error("TMDB connection unavailable")} onRetry={() => undefined} />
            </div>
          </ComponentSpec>

          <ComponentSpec
            name="Feedback message"
            source="pattern composition"
            description="A status role paired with an icon, plain-language title and actionable supporting copy."
            guidance="The system must confirm, warn, inform or explain an error in context."
            anatomy={["status icon", "title", "message", "optional action"]}
          >
            <div className="space-y-3">
              <div className="flex gap-3 rounded-card border border-success/30 bg-success/10 p-4">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Backup complete</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Your local library was exported successfully.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 rounded-card border border-warning/30 bg-warning/10 p-4">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-warning text-warning-foreground">
                  <AlertTriangle className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Connection interrupted</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Local data is safe; remote metadata may be incomplete.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 rounded-card border border-destructive/30 bg-destructive/10 p-4">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                  <CircleAlert className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Import failed</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Check the file format and try again.</p>
                </div>
              </div>
            </div>
          </ComponentSpec>
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
        id="contribution"
        eyebrow="Governance"
        title="Contribution checklist"
        description="A design system stays coherent through review criteria, not only through a catalog. Use this checklist before adding tokens, variants or new primitives."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {contributionChecklist.map((item, index) => (
            <div key={item} className="flex gap-3 rounded-card border border-border bg-card/30 p-4">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-[10px] font-semibold text-primary">
                {index + 1}
              </span>
              <p className="text-sm leading-6 text-muted-foreground">{item}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <Guidance>
            The durable written guide lives at <code className="font-mono text-xs">docs/design-system.md</code>. Keep it
            aligned with this living catalog when architecture, naming or contribution rules change.
          </Guidance>
          <Button asChild>
            <a href="#overview">
              Back to overview <ArrowRight className="size-4 -rotate-90" />
            </a>
          </Button>
        </div>
      </Section>
    </div>
  );
}
