# CineTrack design system

The CineTrack design system is the shared language for building the desktop application. It combines implementation tokens, React primitives, product patterns, accessibility requirements, and contribution rules.

The living visual catalog is available at `/design-system` in development builds. This document covers the durable architecture and governance that should remain readable outside the application.

## Goals

- Preserve a cinematic identity without turning every screen into a one-off composition.
- Give designers and developers the same role-based vocabulary.
- Make light theme, dark theme, user accents, compact density, and reduced motion system concerns rather than feature concerns.
- Build accessibility into tokens and primitives.
- Prefer composition and documented variants over duplicated local styling.

## Token architecture

CineTrack uses four layers. Each layer should depend only on the layer before it.

1. **Reference tokens** store raw reusable values. The current explicit reference palette is `COLOR_PRESETS` in `src/shared/constants/colors.ts`.
2. **Semantic tokens** describe purpose, such as `--background`, `--primary`, `--muted-foreground`, or `--destructive`. Theme values live in `src/styles/index.css`.
3. **Component recipes** combine semantic color, spacing, typography, radius, elevation, and interaction states. They live primarily in `src/components/ui`.
4. **Product patterns** compose primitives for recurring CineTrack tasks, such as empty states, section headers, media progress, or remote-error recovery.

```text
reference value
  -> semantic role
    -> component recipe
      -> product pattern
```

A feature should normally consume a semantic utility or an existing component. It should not import a raw palette value or repeat a component recipe.

## Color: reference versus semantic

### Reference color

A reference color describes the value itself. For example, the violet accent has separate dark-theme and light-theme reference values. Reference colors do not say whether the value is a button, focus ring, selected state, chart series, or status.

Use reference colors only while defining a theme or mapping them to a semantic role.

**Externally-fixed brand colors** (a sign-in provider's logo color, a streaming platform's brand color) are a documented exception: they have no semantic role to map to since the value is fixed by a third party, not by CineTrack's theme. Keep them as named constants next to the other reference values — `OAUTH_BRAND_COLORS` and `PLATFORM_BRAND_COLORS` in `src/shared/constants/colors.ts` — rather than as literals in the feature file that renders them. Purely decorative values with no semantic role (gradients, sheens, and the fixed-black image/modal scrims in `media-card.tsx` and `command-palette.tsx`) follow the same rule but live in `src/shared/constants/decorative-gradients.ts`, which exists specifically so they don't get scattered as literals either — whether the value is a CSS gradient string or a Tailwind className constant.

### Semantic color

A semantic color describes why a color is used.

| Family               | Tokens                                                              | Purpose                                                     |
| -------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Surface and content  | `background`, `card`, `popover`, `muted` and their foreground pairs | Canvas, containers, hierarchy, supporting content           |
| Actions and emphasis | `primary`, `secondary`, `accent` and their foreground pairs         | Action hierarchy, selection, complementary product emphasis |
| Feedback             | `success`, `warning`, `destructive` and their foreground pairs      | Confirmations, attention, errors, irreversible actions      |
| Boundaries           | `border`, `input`, `ring`                                           | Structure, controls, keyboard focus                         |

Every solid semantic fill that contains text or icons has a paired `*-foreground` token. Use the pair together. An on-color token is not a generic text color.

### Color rules

- Choose color from product meaning, not preference.
- Do not use `primary` to mean success or `accent` to mean warning.
- Pair feedback color with a label, icon, or message.
- Avoid raw HSL, RGB, or hex values in feature code when a semantic role exists.
- Opacity variants may soften a semantic color for a background, but text contrast must still be verified on the resulting surface.
- The user-selected accent may change `primary` and `ring`; components must remain correct for every preset.

## Typography

CineTrack uses three font families with non-overlapping responsibilities:

- **Syne** (`font-display`) for expressive display headings, hero titles, and large statistics.
- **DM Sans** (`font-sans`) for interface text, controls, navigation, tables, and body copy.
- **Playfair Display** (`font-serif`) for editorial synopsis text only.

New interface hierarchy should use semantic roles from `tailwind.config.ts`: `display-hero`, `display-title`, `heading-lg`, `heading-md`, `heading-sm`, `body-lg`, `body`, `body-sm`, `caption`, and `overline`.

Use sentence case for interface labels. Keep normal reading lines around 55–75 characters. Do not use font family or size as the only hierarchy signal; combine role, weight, spacing, and content structure.

## Spacing, density, and layout

The spacing system is Tailwind's default 4px-based scale. Do not create a parallel spacing vocabulary without a product-wide requirement.

Use smaller gaps inside a component, medium gaps between related groups, and larger gaps between page sections. Responsive layouts should change composition—wrapping, columns, ordering, and constraints—not only shrink dimensions.

Compact mode applies `.compact` to the root and scales rem-based typography and spacing to 90%. Prefer rem-backed utilities and avoid pixel literals that bypass density scaling.

### Responsive breakpoints

CineTrack uses Tailwind's default breakpoints (`sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px). `src-tauri/tauri.conf.json`'s window `minWidth` is 360px, so every breakpoint is reachable by resizing the real desktop window, not just via `pnpm dev`'s browser-preview surface. `AppShell`'s sidebar/mobile-header split (`lg:` in `src/components/layout/app-shell.tsx`) is live in the shipped app: a sidebar above `lg`, a mobile header plus a fixed bottom `MobileTabBar` below it. This same split is what an eventual Tauri Mobile build (see `src-tauri/gen/apple`) reuses — a phone screen simply always renders the below-`lg` layout.

## Shape and elevation

Radius communicates surface scale and nesting:

- `rounded-card`: media cards and compact content blocks.
- `rounded-panel`: grouped sections, cards, and panels.
- `rounded-shell`: navigation and page-level shells.
- `rounded-hero`: the largest immersive regions.

Nested controls should generally use a smaller radius than their parent surface.

The surface hierarchy is:

1. **Tile** — minimal border; dense rows and nested blocks.
2. **Panel** — flat semantic fill; grouped content without glass or elevation.
3. **Card** — independent glass-like module with blur and default elevation.
4. **Hero** — page-level visual introduction with contextual media treatment.

Elevation shadows express physical separation. `shadow-glow` expresses primary emphasis. Do not use glow as generic depth.

## Motion

Motion should explain cause, continuity, or hierarchy.

- `fast` (200ms): micro-interactions and disclosure icons.
- `base` (300ms): default state and hover transitions.
- `medium` (500ms): section-level transitions.
- `slow` (600ms): entrances.
- `slower` (700ms): deliberate progress and reveals.
- `slowest` (1000ms): rare hero choreography.

Prefer opacity and transform. Avoid layout-shifting animation and decorative loops near reading content. The final state must remain understandable with animation disabled.

Both the app preference and `prefers-reduced-motion` are honored. CSS motion is reduced in `src/styles/index.css`; Framer Motion is controlled by `MotionPreferenceGate`.

## Component model

A component variant should represent repeatable product meaning. Do not add a variant only to avoid writing a local class once. This section covers the primitives with the most product-facing rules (buttons, form controls, status, overlays) — it is not the full inventory of `src/components/ui` (which also has `Accordion`, `AsyncActionFeedback`, `ConfirmDialog`, `FormField`, `Progress`, `Separator`, `SettingToggle`, `Skeleton`, `Tile`, …). See `/design-system` for the complete, current catalog.

Every documented component should cover:

- purpose and when to use it;
- anatomy;
- variants and sizes;
- default, hover, focus, active, disabled, loading, invalid, open, or selected states as applicable;
- content guidance;
- keyboard and screen-reader behavior;
- source file and tests.

### Button hierarchy

- `default`: primary action, normally one per local region.
- `secondary`: supporting action with visible weight.
- `outline`: neutral action on card or complex surfaces.
- `ghost`: low-emphasis toolbar or inline action.
- `destructive`: irreversible or high-risk action.

Use `asChild` to preserve link semantics for navigation while reusing the visual recipe. Every interactive control shows `cursor-pointer` on hover — baked into `buttonVariants`' base class, not repeated ad hoc — and reverts to the default cursor when disabled. Icon-only buttons require an accessible name (`aria-label`) **and** a visible-on-hover label: wrap them in `IconTooltip` (see Overlays) rather than relying on `aria-label` alone, which screen readers announce but sighted mouse users never see.

### Form controls

`Input`, `Select`, and `Textarea` share border, focus, disabled, and `aria-invalid` treatment. Labels, helper messages, and errors are composed at the form level and must be programmatically associated with the control.

Do not use placeholder text as the only label. Error copy should explain the problem and how to correct it.

### Status and metadata

`Badge` is a compact non-interactive label. Use semantic variants for feedback and media variants for movie/series identity. If a chip changes filters or triggers an action, use an interactive control rather than making a badge clickable.

### Overlays

`Sheet` is a modal drawer built on Radix Dialog. It provides `SheetTitle` and `SheetDescription`; both should be present so assistive technology receives a useful name and description.

`Tooltip` (Radix Tooltip) supplies a hover/focus label. `IconTooltip` wraps the Provider/Root/Trigger/Content wiring into one call — `<IconTooltip label={t("...")}>{iconOnlyButton}</IconTooltip>` — and is the default way to add a hover label to an icon-only control; reach for the raw primitives only for a genuinely custom tooltip. It carries its own `TooltipProvider`, so it also renders correctly in isolation (e.g. component tests) without the app-root provider.

## Product patterns

Patterns include content and behavior rules beyond a primitive API.

- **Empty state:** explains a valid absence of data and offers one meaningful action. It is not a loading or error state.
- **Feedback message:** pairs a semantic status, icon, title, plain-language explanation, and optional recovery action.
- **Section header:** establishes page rhythm and may contain one contextual action.
- **Media progress:** communicates completion with a label and percentage when useful.
- **Remote error:** explains what failed, protects local-data expectations, and offers retry or technical details.

## Accessibility contract

- Use semantic HTML before adding ARIA.
- All interactive elements must be keyboard reachable and have visible focus.
- Normal text requires at least 4.5:1 contrast; large text and essential non-text UI require at least 3:1.
- Default actions target a 44px height. Compact 36–40px controls are reserved for dense desktop contexts.
- Do not encode meaning with color alone.
- Icon-only controls need `aria-label` (or visually hidden text) for assistive technology, and an `IconTooltip` (or a native `title`) so sighted mouse users also get a visible hover explanation — an accessible name alone isn't enough.
- Loading, empty, error, success, and disabled are different states and should not share copy or behavior.
- Test light and dark themes and every accent preset.
- Preserve meaning and completion when motion is reduced.

The live catalog calculates contrast from computed CSS custom properties. `src/shared/utils/__tests__/contrast.test.ts` protects the theme and accent pair contracts.

## Contribution workflow

Before adding or changing a token, component, or pattern:

1. Search for an existing semantic role, primitive, or composition.
2. Confirm the need is repeatable across more than one product context.
3. Define intent and naming before choosing styling values.
4. Implement states and accessibility with the base component.
5. Add the component or variant to `/design-system` with guidance and representative states.
6. Add or update tests for public APIs and token contracts.
7. Verify light/dark, every accent where relevant, compact mode, keyboard use, and reduced motion.
8. Run format, lint, typecheck, unit tests, and build validation.

## Sources of truth

| Concern                              | Source                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| Theme and semantic CSS variables     | `src/styles/index.css`                                                        |
| Tailwind aliases and semantic scales | `tailwind.config.ts`                                                          |
| Accent reference values              | `src/shared/constants/colors.ts`                                              |
| Runtime theme mapping                | `src/components/layout/theme-controller.tsx`                                  |
| UI primitives                        | `src/components/ui`                                                           |
| Product patterns                     | `src/components/media`, `src/components/states`                               |
| Live catalog                         | `src/pages/design-system-page.tsx` and `src/pages/design-system`              |
| Contrast implementation and tests    | `src/shared/utils/contrast.ts`, `src/shared/utils/__tests__/contrast.test.ts` |

## External references

The architecture borrows proven concepts rather than visual styling from other systems:

- Material Design 3: design tokens and role-based color.
- IBM Carbon Design System: role-based core and component tokens.
- Atlassian Design System: tokens as a theming and cross-discipline source of truth.
- Shopify Polaris: primitive and semantic token distinction.
