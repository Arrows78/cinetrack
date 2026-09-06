# CineTrack design system

The CineTrack design system is the shared language for building the desktop application. It combines implementation tokens, React primitives, product patterns, accessibility requirements, and contribution rules.

Application UI uses semantic typography roles from `tailwind.config.ts`
exclusively — no raw Tailwind text-size utility (`text-xs`, `text-sm`,
`text-lg`, `text-xl`, `text-2xl`, `text-3xl`, `text-4xl`, `text-5xl`, ...)
appears anywhere in feature code, including inside `src/components/ui`'s own
primitives. Every size in real use maps to a named role; the two rarest
sizes (`display-md` at 3rem, `heading-xs` at 1rem) exist purely because a
real call site needed exactly that pixel value and no other role matched —
add a role rather than reach for a raw size when a new one comes up, the
same way these two were added.

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

### Subtle foreground tints

`bg-foreground/N` opacity washes cover more than one role — don't force them to a single value, but keep each role internally consistent:

- **Row/tile hover** (a clickable content row with a poster, an accordion trigger, a dashboard-rail tile): `hover:bg-foreground/[0.04]`.
- **Compact control hover** (an icon-only button, a small pill/chip, a toast action): `hover:bg-foreground/10` — a smaller hit target reads better with a stronger tint than a full row does.
- **Sidebar/nav-link hover**: `hover:bg-foreground/5` — its own established, internally-consistent family (transparent at rest, doubled on hover), reused wherever a page reproduces the sidebar's own nav-link look (e.g. the design system catalog's in-page section nav).
- **Static decorative washes** (a skeleton block, an icon-circle backdrop, a divider line, a progress track) are a separate, deliberately-varied family — each picks whatever visual weight suits that element and isn't governed by the hover scale above. Where the exact same percentage is needed, prefer the plain shorthand (`bg-foreground/5`) over the arbitrary-value bracket form (`bg-foreground/[0.05]`); reach for the bracket form only for a percentage Tailwind's default opacity scale doesn't expose (2%, 3%, 4%, 6%, 7%, 8%).

## Typography

CineTrack uses three font families with non-overlapping responsibilities:

- **Syne** (`font-display`) for expressive display headings, hero titles, and large statistics.
- **DM Sans** (`font-sans`) for interface text, controls, navigation, tables, and body copy — including synopsis, biography, and personal-note body text (see below).
- **Playfair Display** (`font-serif`) is defined but not currently used anywhere in the product. It originally styled synopsis/biography text with an editorial serif treatment; that was replaced with `font-sans` at `text-body-lg` after user feedback that the serif face read poorly for that content. Kept as a token in case a genuinely editorial context (not general body copy) needs it later — don't reintroduce it for descriptive text.

New interface hierarchy should use semantic roles from `tailwind.config.ts`: `display-hero`, `display-md`, `display-title`, `page-title`, `heading-lg`, `heading-md`, `heading-sm`, `heading-xs`, `body-lg`, `body`, `body-sm`, `caption`, and `overline`. `body-sm` is deliberately defined at the exact same size as Tailwind's own stock `text-sm` (0.875rem) — it used to sit at 0.8125rem, a size nobody ever adopted precisely because switching to it would have visibly shrunk running text app-wide. Aliasing its metrics to `text-sm` means `text-sm` → `text-body-sm` is a pure rename wherever the text is genuinely body copy, never a rendering change — it's still worth using the semantic name once you're touching a line anyway, so a future change to `body-sm` alone (not `text-sm` everywhere) is possible without hunting down every raw usage.

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

Nested controls should generally use a smaller radius than their parent surface. Below the surface scale, two control-tier radii are in active use: `rounded-xl` (`Tile` itself, badges, small thumbnails) and `rounded-2xl` (`Input`, `Select`, `Toast`, nav rows). Both are pinned to `var(--radius)` in `tailwind.config.ts` (same values as `rounded-sm`/`rounded-lg` respectively, by design) so a future `--radius` change can't leave one half of the app's controls behind — prefer `rounded-xl`/`rounded-2xl` for this tier since that's what the rest of the app already writes; `rounded-sm` stays reserved for genuinely tiny decorative detail (calendar cells, activity heatmap swatches) that isn't a control at all, even though it renders at the same size as `rounded-xl`.

The surface hierarchy is:

1. **Tile** — minimal border; dense rows and nested blocks.
2. **Panel** — flat semantic fill; grouped content without glass or elevation.
3. **Card** — independent glass-like module with blur and default elevation.
4. **Hero** — page-level visual introduction with contextual media treatment.

**Tile vs. `.surface rounded-card`:** both render a compact list row, but for two different weights of content. Use `Tile` for a row with no image (an alert, an agenda entry, a settings row) — flat border, no blur, no shadow. Use `.surface rounded-card` for a row built around a poster or avatar (a media card, a watch-next row, a recently-watched row) — it adds the blurred glass background and shadow that make an image-bearing row read as its own module. Don't mix the two for the same repeated list (e.g. a media-list-row with a poster using bare `Tile` is under-styled for what it's showing); it's fine for two _different_ rows on the same screen to use each, as long as each row's own choice matches whether it carries an image.

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

`Tooltip` (Radix Tooltip) supplies a hover/focus label. `IconTooltip` wraps the Provider/Root/Trigger/Content wiring into one call — `<IconTooltip label={t("...")}>{iconOnlyButton}</IconTooltip>` — and is the default way to add a hover label to an icon-only control; reach for the raw primitives only for a genuinely custom tooltip. It carries its own `TooltipProvider`, so it also renders correctly in isolation (e.g. component tests) without the app-root provider. `IconTooltip` wraps a _disabled_ child in a focusable `<span tabIndex={0}>` internally — a disabled button's own `pointer-events-none` would otherwise make the tooltip that explains _why_ it's disabled unreachable by hover or keyboard, which is exactly the situation where the label matters most.

### Canonical action rules

These hold across every button, toggle, and dialog in the app — found by auditing for exceptions, not proposed in the abstract:

- **Destructive color, always confirmed.** The `destructive` button variant never appears outside a `ConfirmDialog`. There should be zero exceptions; if you're tempted to add a red button with no confirmation, that's the signal you're missing a `ConfirmDialog`, not that this rule doesn't apply here.
- **`ConfirmDialog` button labels repeat the verb**, not a generic "Confirm" — `confirmLabel={t("library.remove")}` ("Remove"), not `t("common.confirm")`. A destructive dialog whose button repeats the action reduces mis-clicks far more than a neutral confirm; it also means two dialogs that differ only in scope (e.g. "remove this item" vs. "delete the whole list") still read as different actions even before the user reaches the description.
- **`ConfirmDialog` always gets a `description`** stating the concrete consequence (what's deleted, whether it's recoverable) — the title alone is rarely enough to distinguish two similar-looking destructive actions.
- **`isConfirming` is wired to the real mutation state**, and the dialog only closes once that mutation has settled (success _or_ failure) — never optimistically before it starts. This is what makes a double-click on the confirm button safe (the button disables itself mid-flight) and gives the user real feedback instead of a dialog that vanishes while something is still happening in the background.
- **A bascule (toggle) button always sets `aria-pressed`, with a label that reflects its current state** — "Mark watched" / "Mark unwatched", never a label frozen to one state regardless of what's actually toggled.
- **Every icon-only button** gets `size="icon"`, an `aria-label`, an `IconTooltip`, and a `size-4` glyph — see the Button and Overlays sections above.
- **Error toast: always, for every user-triggered action that can fail.** The app-wide `MutationCache.onError` handler (`src/app/query-client.ts`) covers this by default for every mutation; a call site only needs its own local error handling when it wants to show something more specific than the generic failure toast (in which case, opt the mutation out of the global handler via `meta.suppressErrorToast` so the user doesn't see the same failure twice).
- **Success toast: only when the result isn't already visible on screen** — export, import, clearing a cache, restoring a backup. Skip it when the UI's own optimistic update already shows the new state; the button/toggle changing _is_ the confirmation, and a toast on top of that is redundant noise.

## Product patterns

Patterns include content and behavior rules beyond a primitive API.

- **Empty state:** explains a valid absence of data and offers one meaningful action. It is not a loading or error state.
- **Feedback message:** pairs a semantic status, icon, title, plain-language explanation, and optional recovery action.
- **Section header:** establishes page rhythm and may contain one contextual action. The decorative eyebrow rule (`index` prop, drawn via `.section-rule`) is reserved for a dashboard-style page's own sibling zones — Home's rails, Stats' sections — where it demarcates one self-contained zone from the next. A detail page (movie, series, person, season, episode) is a single continuous scroll about one item, not a set of interchangeable zones, so its `SectionHeader`s never pass `index`. Never combine `index` with `isPageTitle` either — a page's own `<h1>` never draws a rule above itself, no matter which page renders it.
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
