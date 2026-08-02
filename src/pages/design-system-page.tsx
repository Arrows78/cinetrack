import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tile } from "@/components/ui/tile";
import { COLOR_PRESETS, type AccentColor } from "@/shared/constants/colors";
import { cn } from "@/shared/lib/cn";

// Internal dev tool — reachable only at /design-system, and only registered
// in the route tree when import.meta.env.DEV is true (see router-config.tsx).
// Not localized on purpose: it documents the token system for whoever is
// building UI, not end users, so it doesn't need react-i18next or entries in
// locale-parity.test.ts.

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
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

const colorPairs: { label: string; bg: string; fg: string }[] = [
  { label: "Background", bg: "background", fg: "foreground" },
  { label: "Card", bg: "card", fg: "card-foreground" },
  { label: "Popover", bg: "popover", fg: "popover-foreground" },
  { label: "Primary", bg: "primary", fg: "primary-foreground" },
  { label: "Secondary", bg: "secondary", fg: "secondary-foreground" },
  { label: "Muted", bg: "muted", fg: "muted-foreground" },
  { label: "Accent", bg: "accent", fg: "accent-foreground" },
  { label: "Destructive", bg: "destructive", fg: "destructive-foreground" },
  { label: "Success", bg: "success", fg: "success-foreground" },
  { label: "Warning", bg: "warning", fg: "warning-foreground" },
];

const lineTokens: { label: string; varName: string }[] = [
  { label: "Border", varName: "border" },
  { label: "Input", varName: "input" },
  { label: "Ring", varName: "ring" },
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
  { value: "[0.03]", usage: "Panel tone=\"subtle\", tracked-series rows, accordion trigger" },
  { value: "[0.04]", usage: "Empty-state icon circle, episode row hover" },
  { value: "[0.06]", usage: "Hover/active state over a [0.03] surface, filter-bar segmented track" },
  { value: "[0.07]", usage: "Decorative timeline connector (history page)" },
  { value: "[0.08]", usage: "Progress bar track" },
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
  { name: "sticky", value: "30", usage: "Sticky mobile header (AppShell)" },
  { name: "dropdown", value: "40", usage: "Dropdown menus, popovers" },
  { name: "overlay", value: "50", usage: "Dimmed backdrop / floating banners (Sheet, indicators)" },
  { name: "modal", value: "50", usage: "Sheet/Dialog content" },
  { name: "toast", value: "60", usage: "Notifications above everything else" },
  { name: "command-palette", value: "100", usage: "Command palette (Cmd+K), above everything" },
];

const buttonVariantList = ["default", "secondary", "ghost", "outline", "destructive"] as const;
const buttonSizeList = ["sm", "default", "lg", "icon"] as const;
const badgeVariantList = ["default", "secondary", "outline", "movie", "series"] as const;

export function DesignSystemPage() {
  return (
    <div className="space-y-12 pb-16">
      <div>
        <p className="text-overline uppercase text-primary/70">Internal tool · dev only</p>
        <h1 className="font-display text-display-title font-bold">Design system</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Living catalog of tokens (colors, typography, radius, shadows, motion, z-index, tint) and{" "}
          <code className="font-mono text-xs">components/ui</code> primitives. Source of truth:{" "}
          <code className="font-mono text-xs">src/styles/index.css</code> and{" "}
          <code className="font-mono text-xs">tailwind.config.ts</code>.
        </p>
      </div>

      <Section title="Colors" description="Background/foreground pairs from src/styles/index.css (:root = dark, .light = light).">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {colorPairs.map((pair) => (
            <TokenTile key={pair.bg} label={pair.label} meta={`--${pair.bg} / --${pair.fg}`}>
              <div
                className="flex h-20 items-center justify-center rounded-card border border-border/50"
                style={{ backgroundColor: `hsl(var(--${pair.bg}))`, color: `hsl(var(--${pair.fg}))` }}
              >
                <span className="text-lg font-semibold">Aa</span>
              </div>
            </TokenTile>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {lineTokens.map((token) => (
            <TokenTile key={token.varName} label={token.label} meta={`--${token.varName}`}>
              <div className="h-10 rounded-card border-2" style={{ borderColor: `hsl(var(--${token.varName}))` }} />
            </TokenTile>
          ))}
        </div>

        <div>
          <p className="mb-3 text-sm font-medium">
            Accent presets <span className="text-muted-foreground">(override --primary/--ring at runtime)</span>
          </p>
          <div className="flex flex-wrap gap-4">
            {(Object.entries(COLOR_PRESETS) as [AccentColor, (typeof COLOR_PRESETS)[AccentColor]][]).map(
              ([key, preset]) => (
                <div key={key} className="flex flex-col items-center gap-1.5">
                  <div className="size-9 rounded-full" style={{ backgroundColor: preset.swatch }} />
                  <span className="text-xs text-muted-foreground">{preset.label}</span>
                </div>
              )
            )}
          </div>
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
        title="Typography"
        description="Semantic type roles (text-*), additive to the default Tailwind scale. Target for new components — not yet adopted everywhere."
      >
        <div className="space-y-4">
          {typeRoles.map((role) => (
            <div key={role.name} className="flex items-baseline justify-between gap-4 border-b border-border/40 pb-3">
              <p className={cn(role.className, role.display && "font-display")}>The quick brown fox</p>
              <div className="shrink-0 text-right">
                <p className="font-mono text-xs">text-{role.name}</p>
                <p className="text-xs text-muted-foreground">{role.meta}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section title="Radius" description="Surface scale (posters → hero panels), exposed as rounded-*.">
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
        title="Tint"
        description={
          'bg-foreground/[value] — a single, theme-invariant class for the "contrast overlay" family (subtle panels, hover states, tracks, dividers). Replaces the old bg-black/[x] dark:bg-white/[x] pair.'
        }
      >
        <div className="overflow-hidden rounded-panel border border-border">
          <table className="w-full text-sm">
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
              <div
                className={cn("h-16 w-16 rounded-xl border border-border", `bg-foreground/${tier.value}`)}
              />
            </TokenTile>
          ))}
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section
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

      <Section title="Motion" description="Named durations + the --ease-out-expo curve (hover each bar).">
        <div className="space-y-3">
          {motionTokens.map((token) => (
            <div key={token.name} className="flex items-center gap-4">
              <span className="w-40 shrink-0 font-mono text-xs text-muted-foreground">{token.name}</span>
              <div className="group h-10 w-full max-w-md overflow-hidden rounded-full bg-foreground/5">
                <div
                  className={cn(
                    "h-full w-10 rounded-full bg-primary transition-transform ease-out-expo group-hover:translate-x-[calc(100%-2.5rem)]",
                    token.className
                  )}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Separator className="opacity-40" />

      <Section title="Z-index" description="Named scale, additive to Tailwind's default numeric scale.">
        <div className="overflow-hidden rounded-panel border border-border">
          <table className="w-full text-sm">
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
        title="Components"
        description="components/ui primitives, unchanged — this catalog documents them, it doesn't modify them."
      >
        <div className="grid gap-6 lg:grid-cols-2">
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
                badge.tsx — <code className="font-mono">movie</code>/<code className="font-mono">series</code> are
                the media-type chip colors, reused both in the detail hero and (with a{" "}
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
                = "card" (bg-card/60) or "subtle" (bg-foreground/[0.03]). <code className="font-mono">asChild</code>{" "}
                to render as another element (Link, article...).
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
                tile.tsx — minimal bordered box for list rows and small nested blocks. No default background or
                padding: a plainer, smaller sibling of Panel (rounded-xl vs rounded-panel).
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
        </div>
      </Section>
    </div>
  );
}
