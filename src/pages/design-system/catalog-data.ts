export const navSections = [
  { id: "overview", label: "Overview" },
  { id: "signature", label: "Signature" },
  { id: "color-primitives", label: "Color primitives" },
  { id: "semantic-colors", label: "Semantic colors" },
  { id: "typography", label: "Typography" },
  { id: "layout", label: "Layout" },
  { id: "shape", label: "Shape" },
  { id: "elevation", label: "Elevation" },
  { id: "motion", label: "Motion" },
  { id: "iconography", label: "Icons" },
  { id: "accessibility", label: "Accessibility" },
  { id: "inventory", label: "Inventory" },
  { id: "components", label: "Components" },
  { id: "patterns", label: "Patterns" },
  { id: "contribution", label: "Contribution" },
] as const;

export const semanticColorGroups: {
  title: string;
  description: string;
  pairs: { label: string; bg: string; fg: string; usage: string }[];
}[] = [
  {
    title: "Surface & content",
    description: "The neutral canvas and content hierarchy. These tokens should dominate most screens.",
    pairs: [
      {
        label: "Background",
        bg: "background",
        fg: "foreground",
        usage: "Application canvas and default text.",
      },
      { label: "Card", bg: "card", fg: "card-foreground", usage: "Raised or grouped content surfaces." },
      {
        label: "Popover",
        bg: "popover",
        fg: "popover-foreground",
        usage: "Transient floating content such as menus and dialogs.",
      },
      { label: "Muted", bg: "muted", fg: "muted-foreground", usage: "Low-emphasis content and quiet controls." },
    ],
  },
  {
    title: "Actions & emphasis",
    description:
      "Interactive hierarchy. Choose the role from the action's importance, never from personal color preference.",
    pairs: [
      {
        label: "Primary",
        bg: "primary",
        fg: "primary-foreground",
        usage: "The single most important action or selected state in a context.",
      },
      {
        label: "Secondary",
        bg: "secondary",
        fg: "secondary-foreground",
        usage: "Supporting actions and neutral controls.",
      },
      {
        label: "Accent",
        bg: "accent",
        fg: "accent-foreground",
        usage: "Cyan product accent for complementary emphasis, never a substitute for status.",
      },
    ],
  },
  {
    title: "Feedback",
    description:
      "Meaning-bearing status roles. Pair color with text or iconography so status is never communicated by hue alone.",
    pairs: [
      {
        label: "Success",
        bg: "success",
        fg: "success-foreground",
        usage: "Completed, available, synced, or confirmed outcomes.",
      },
      {
        label: "Warning",
        bg: "warning",
        fg: "warning-foreground",
        usage: "Attention required without immediate data loss or failure.",
      },
      {
        label: "Destructive",
        bg: "destructive",
        fg: "destructive-foreground",
        usage: "Errors, irreversible actions, failed operations, and removal.",
      },
    ],
  },
];

export const semanticColorUsage = [
  {
    token: "primary",
    use: "Primary CTA, selected toggle, focus ring, active navigation.",
    avoid: "Decorating every card or showing success/error state.",
  },
  {
    token: "accent",
    use: "Complementary product emphasis, series identity, decorative data accents.",
    avoid: "Warning or informational status without a label.",
  },
  {
    token: "muted",
    use: "Secondary copy, inactive surfaces, tracks, helper text.",
    avoid: "Critical instructions or the only indication of state.",
  },
  {
    token: "success / warning / destructive",
    use: "Explicit feedback with a matching icon or message.",
    avoid: "Brand decoration or media categorisation.",
  },
  {
    token: "*-foreground",
    use: "Text and icons placed directly on the matching solid token.",
    avoid: "Using an on-color token on unrelated surfaces.",
  },
] as const;

export const lineTokens = [
  { label: "Border", varName: "border", usage: "Structural separation and container outlines." },
  { label: "Input", varName: "input", usage: "Form-control boundary where it differs from general borders." },
  { label: "Ring", varName: "ring", usage: "Keyboard focus and active control emphasis." },
] as const;

export const typeFamilies = [
  {
    name: "Syne",
    role: "Display",
    sampleClassName: "font-display font-bold",
    usage: "Headings, hero titles and expressive statistic values.",
  },
  {
    name: "DM Sans",
    role: "Interface",
    sampleClassName: "font-sans",
    usage: "Body copy, controls, labels, tables and navigation.",
  },
  {
    name: "Playfair Display",
    role: "Editorial",
    sampleClassName: "font-serif italic",
    usage: "Long-form film and series synopsis text only.",
  },
] as const;

export const typeRoles = [
  { name: "display-hero", className: "text-display-hero", meta: "56px · 800 · 1.05 · -0.02em", display: true },
  { name: "display-title", className: "text-display-title", meta: "36px · 700 · 1.15 · -0.01em", display: true },
  { name: "heading-lg", className: "text-heading-lg font-semibold", meta: "24px · 600 · 1.25" },
  { name: "heading-md", className: "text-heading-md font-semibold", meta: "20px · 600 · 1.30" },
  { name: "heading-sm", className: "text-heading-sm font-semibold", meta: "18px · 600 · 1.35" },
  { name: "body-lg", className: "text-body-lg", meta: "17px · 400 · 1.60" },
  { name: "body", className: "text-body", meta: "15px · 400 · 1.60" },
  { name: "body-sm", className: "text-body-sm", meta: "13px · 400 · 1.50" },
  { name: "caption", className: "text-caption text-muted-foreground", meta: "12px · 400 · 1.40" },
  { name: "overline", className: "text-overline uppercase text-muted-foreground", meta: "10px · 600 · 0.30em" },
] as const;

export const spacingSteps = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24] as const;

// Tailwind's default screens (no override in tailwind.config.ts) — listed
// here for the same reason spacing is: not a reinvented scale, but real
// breakpoints used throughout the app deserve a reference table like every
// other dimension in this catalog, not just a passing mention in prose.
export const breakpoints = [
  { name: "sm", value: "640px", usage: "First reflow point — grids go from a single column to 2–3." },
  { name: "md", value: "768px", usage: "Moderate reflow and type-scale bumps (e.g. SectionHeader's title size)." },
  {
    name: "lg",
    value: "1024px",
    usage:
      "The desktop/mobile split — AppShell swaps the sidebar for the mobile header here. Unreachable in the packaged app (tauri.conf.json sets minWidth: 1100, above this breakpoint) — only exercised via `pnpm dev` in a resized browser.",
  },
  { name: "xl", value: "1280px", usage: "Further grid reflow on wide layouts (e.g. the genre grid on Home)." },
  { name: "2xl", value: "1536px", usage: "Rare — used sparingly for grids that still have room to add a column." },
] as const;

export const radii = [
  { name: "sm", className: "rounded-sm", usage: "Tight internal details." },
  { name: "md", className: "rounded-md", usage: "Compact controls." },
  { name: "lg", className: "rounded-lg", usage: "Default control radius." },
  { name: "card", className: "rounded-card", usage: "Media cards and compact content blocks." },
  { name: "panel", className: "rounded-panel", usage: "Cards, panels and grouped sections." },
  { name: "shell", className: "rounded-shell", usage: "Navigation shells and page-level containers." },
  { name: "hero", className: "rounded-hero", usage: "Hero regions and the largest visual surfaces." },
] as const;

export const shadows = [
  { name: "elevation-xs", className: "shadow-elevation-xs", usage: "Subtle separation from the canvas." },
  { name: "elevation-sm", className: "shadow-elevation-sm", usage: "Default card elevation." },
  { name: "elevation-md", className: "shadow-elevation-md", usage: "Floating or interactive surfaces." },
  { name: "elevation-lg", className: "shadow-elevation-lg", usage: "Overlays and prominent floating content." },
  { name: "elevation-xl", className: "shadow-elevation-xl", usage: "Rare, highest physical separation." },
  { name: "glow", className: "shadow-glow", usage: "Primary action emphasis, not structural depth." },
] as const;

export const surfaceHierarchy = [
  { name: "Tile", recipe: "border + rounded-xl", usage: "Dense rows and nested blocks." },
  { name: "Panel", recipe: "border + flat semantic fill", usage: "Grouped content without glass or elevation." },
  { name: "Card", recipe: ".surface + blur + elevation-sm", usage: "Independent content modules." },
  { name: "Hero", recipe: "large radius + contextual treatment", usage: "Page introduction and immersive media." },
] as const;

export const tintScale = [
  { value: "[0.02]", usage: "Nested content directly below a tinted header." },
  { value: "[0.03]", usage: "Subtle panels and quiet list rows." },
  { value: "[0.04]", usage: "Icon containers and light hover states." },
  { value: "5", usage: "Skeletons, navigation surfaces and inactive controls." },
  { value: "[0.06]", usage: "Hover or selected state over an already tinted surface." },
  { value: "[0.08]", usage: "Progress tracks." },
  { value: "10", usage: "Separators, standard tracks and close-button hover." },
  { value: "20", usage: "Strong idle boundaries and unwatched markers." },
] as const;

export const motionTokens = [
  { name: "fast", value: "200ms", className: "duration-fast", usage: "Micro-interactions and disclosure icons." },
  { name: "base", value: "300ms", className: "duration-base", usage: "Default hover and state transitions." },
  { name: "medium", value: "500ms", className: "duration-medium", usage: "Section-level transitions." },
  { name: "slow", value: "600ms", className: "duration-slow", usage: "Entrance motion." },
  { name: "slower", value: "700ms", className: "duration-slower", usage: "Progress and deliberate reveals." },
  { name: "slowest", value: "1000ms", className: "duration-slowest", usage: "Hero choreography only." },
] as const;

export const zIndexScale = [
  { name: "raised", value: "10", usage: "Raised element inside a local stacking context." },
  { name: "sticky", value: "30", usage: "Sticky headers and catalog navigation." },
  { name: "dropdown", value: "40", usage: "Menus and popovers." },
  { name: "overlay", value: "50", usage: "Dimmed overlay backdrops." },
  { name: "modal", value: "50", usage: "Dialog and sheet content." },
  { name: "toast", value: "60", usage: "Notifications above overlays." },
  { name: "command-palette", value: "100", usage: "Global command interface." },
] as const;

export const buttonVariants = [
  { name: "default", use: "Primary action; normally one per region." },
  { name: "secondary", use: "Supporting action with visible weight." },
  { name: "outline", use: "Neutral action on complex or card surfaces." },
  { name: "ghost", use: "Low-emphasis toolbar and inline action." },
  { name: "destructive", use: "Irreversible or high-risk action." },
] as const;

export const buttonSizes = [
  { name: "sm", meta: "36px high", use: "Dense desktop forms and local controls." },
  { name: "default", meta: "44px high", use: "Standard action and preferred touch target." },
  { name: "lg", meta: "48px high", use: "Hero and onboarding actions." },
  { name: "icon", meta: "40 × 40px", use: "Icon-only action with an accessible name." },
] as const;

export const badgeVariants = [
  "default",
  "secondary",
  "outline",
  "success",
  "warning",
  "destructive",
  "movie",
  "series",
] as const;

export const iconSizes = [
  { size: 16, className: "size-4", usage: "Inline labels, table actions and dense controls." },
  { size: 20, className: "size-5", usage: "Default buttons, navigation and status messages." },
  { size: 24, className: "size-6", usage: "Standalone actions and prominent content." },
  { size: 28, className: "size-7", usage: "Empty states and rare illustrative moments." },
] as const;

export const accessibilityChecklist = [
  "Use semantic HTML before adding ARIA.",
  "Every interactive element must have a visible focus state and keyboard path.",
  "Pair status color with a label, icon or message; never encode meaning with hue alone.",
  "Maintain 4.5:1 for normal text, 3:1 for large text and essential non-text UI.",
  "Prefer the 44px default action height; reserve compact controls for dense desktop contexts.",
  "Honor both the app reduce-motion preference and the operating-system media query.",
  "Icon-only actions require an aria-label or visually hidden text.",
  "Error messages should explain what happened and the next available action.",
] as const;

export const contributionChecklist = [
  "Start from an existing semantic token or component recipe; avoid raw color values in feature code.",
  "Add a variant only when it represents a repeatable product meaning, not a one-off visual treatment.",
  "Document anatomy, usage, states, content guidance and accessibility in this catalog.",
  "Test keyboard interaction and both light/dark themes, including every user-selectable accent.",
  "Add or update unit tests when a component API or token contract changes.",
  "Run format, lint, typecheck and tests before committing.",
] as const;

export const componentStateModel = [
  {
    state: "Enabled",
    appliesTo: "All interactive components",
    expectation:
      "The control communicates its purpose and is available to pointer, keyboard and assistive technology users.",
  },
  {
    state: "Hover",
    appliesTo: "Pointer targets",
    expectation: "A subtle visual change confirms interactivity without being the only way to discover the action.",
  },
  {
    state: "Focus visible",
    appliesTo: "Keyboard-focusable controls",
    expectation: "A high-contrast ring remains visible and is never removed without an equivalent replacement.",
  },
  {
    state: "Pressed / active",
    appliesTo: "Buttons, toggles and disclosure controls",
    expectation: "The immediate interaction is acknowledged while preserving the control's accessible name.",
  },
  {
    state: "Selected / current",
    appliesTo: "Navigation, filters, tabs and choices",
    expectation: "Selection is exposed semantically and reinforced with more than color alone.",
  },
  {
    state: "Disabled",
    appliesTo: "Unavailable actions and form controls",
    expectation:
      "The control cannot be activated, remains legible and is accompanied by context when the reason is not obvious.",
  },
  {
    state: "Loading / busy",
    appliesTo: "Async actions and remote content",
    expectation: "Duplicate actions are blocked, progress is announced when useful and layout remains stable.",
  },
  {
    state: "Empty",
    appliesTo: "Collections and result regions",
    expectation: "The interface distinguishes no data from loading or failure and offers the next useful action.",
  },
  {
    state: "Error",
    appliesTo: "Forms, repositories and remote requests",
    expectation:
      "Plain-language recovery guidance is paired with an icon, message or status role rather than color alone.",
  },
] as const;

export const sheetSides = [
  { name: "left", use: "Primary or secondary navigation that should feel attached to the application shell." },
  { name: "right", use: "Inspectors, filters and edit forms that complement the current page." },
  { name: "top", use: "Compact global controls or time-sensitive information with a horizontal reading flow." },
  { name: "bottom", use: "Mobile-friendly actions, summaries and short focused tasks." },
] as const;

export const sheetSizes = [
  { name: "sm", use: "One decision, a short menu or a compact group of controls." },
  { name: "md", use: "Default forms and inspectors with a moderate amount of supporting content." },
  { name: "lg", use: "Multi-section tasks that still benefit from visible page context." },
  { name: "xl", use: "Complex workflows that need near-page capacity without becoming a route." },
] as const;

// Sample content for pattern demos that need a realistic media/cast shape
// (MediaCard, MediaGrid, CastList, Pill) — kept here, not invented inline in
// the page, so it reads as one deliberate demo dataset rather than scattered
// literals.
export const catalogMedia: {
  id: number;
  mediaType: "movie" | "series";
  title: string;
  overview: string;
  posterPath: null;
  backdropPath: null;
  year: number;
  rating: number;
  genres: string[];
  cast: [];
  progress?: { watched: number; total: number };
}[] = [
  {
    id: 872585,
    mediaType: "movie",
    title: "Oppenheimer",
    overview: "The story of J. Robert Oppenheimer and the making of the atomic bomb.",
    posterPath: null,
    backdropPath: null,
    year: 2023,
    rating: 8.1,
    genres: ["Drama", "History"],
    cast: [],
  },
  {
    id: 94997,
    mediaType: "series",
    title: "House of the Dragon",
    overview: "The Targaryen civil war, 200 years before the events of Game of Thrones.",
    posterPath: null,
    backdropPath: null,
    year: 2022,
    rating: 8.4,
    genres: ["Drama", "Fantasy"],
    cast: [],
    progress: { watched: 6, total: 10 },
  },
  {
    id: 84958,
    mediaType: "series",
    title: "Loki",
    overview: "The mercurial villain Loki resumes his role as the God of Mischief.",
    posterPath: null,
    backdropPath: null,
    year: 2021,
    rating: 8.2,
    genres: ["Sci-Fi", "Fantasy"],
    cast: [],
    progress: { watched: 6, total: 6 },
  },
] as const;

export const catalogCast = [
  { id: 1, name: "Cillian Murphy", character: "J. Robert Oppenheimer", profilePath: null },
  { id: 2, name: "Emily Blunt", character: "Katherine Oppenheimer", profilePath: null },
  { id: 3, name: "Matt Damon", character: "Leslie Groves", profilePath: null },
] as const;

export const catalogPills = [
  { label: "Science Fiction", movieId: 878 },
  { label: "Christopher Nolan", movieId: 525 },
  { label: "Netflix", providerId: 8 },
] as const;

// 16 episodes, first 8 watched — matches the shape EpisodeDots expects
// (Season["episodes"]) for the Signature section's live demo.
export const catalogEpisodes = Array.from({ length: 16 }, (_, index) => ({
  id: index + 1,
  seasonNumber: 2,
  episodeNumber: index + 1,
  title: `Episode ${index + 1}`,
  overview: "",
}));
export const catalogWatchedEpisodeIds = new Set(catalogEpisodes.slice(0, 8).map((episode) => episode.id));

// The one deliberate signature decision — see /design-system#signature.
// EpisodeDots (season-accordion.tsx) already looked like film-sprocket
// perforations by accident before this pass leaned into it on purpose;
// .section-rule (the eyebrow mark under every SectionHeader) got the same
// idea as a fading row of ticks instead of a plain gradient line.
export const signatureApplications = [
  {
    name: "Episode filmstrip",
    source: "components/media/season-accordion.tsx",
    detail:
      'Each episode is a small perforation: a dark "unexposed" mark when unwatched, lit up in the current accent color when watched — the metaphor maps onto "watching" directly instead of decorating it.',
  },
  {
    name: "Perforation rule",
    source: "styles/index.css · .section-rule",
    detail:
      "The eyebrow mark under every SectionHeader title is a row of small ticks fading to transparent (repeating-linear-gradient + a mask), not a plain gradient hairline.",
  },
] as const;

export type ComponentCoverage = "live" | "reference" | "internal";
export type ComponentLayer = "primitive" | "pattern" | "feature" | "infrastructure";

export type ComponentInventoryItem = {
  name: string;
  source: `components/${string}.tsx`;
  group: string;
  layer: ComponentLayer;
  coverage: ComponentCoverage;
  purpose: string;
};

function component(
  name: string,
  source: ComponentInventoryItem["source"],
  group: string,
  layer: ComponentLayer,
  coverage: ComponentCoverage,
  purpose: string
): ComponentInventoryItem {
  return { name, source, group, layer, coverage, purpose };
}

export const componentInventory = [
  component(
    "AddToListButton",
    "components/collections/add-to-list-button.tsx",
    "Collections",
    "feature",
    "reference",
    "Adds or removes media from a user-defined collection."
  ),
  component(
    "BrowserPreviewBanner",
    "components/desktop/browser-preview-banner.tsx",
    "Desktop",
    "pattern",
    "reference",
    "Explains browser-only limitations when desktop capabilities are unavailable."
  ),
  component(
    "CommandPalette",
    "components/desktop/command-palette.tsx",
    "Desktop",
    "feature",
    "reference",
    "Provides keyboard-first navigation and global actions."
  ),
  component(
    "TokenGate",
    "components/desktop/token-gate.tsx",
    "Desktop",
    "infrastructure",
    "internal",
    "Blocks protected desktop flows until the local token is available."
  ),
  component(
    "BootRecoveryGate",
    "components/desktop/boot-recovery-gate.tsx",
    "Desktop",
    "infrastructure",
    "internal",
    "Offers to restore the last automatic backup after the database had to be reset at startup."
  ),
  component(
    "AppShell",
    "components/layout/app-shell.tsx",
    "Layout",
    "infrastructure",
    "reference",
    "Defines the persistent navigation and page-content frame."
  ),
  component(
    "MotionPreferenceGate",
    "components/layout/motion-preference-gate.tsx",
    "Layout",
    "infrastructure",
    "internal",
    "Synchronizes reduced-motion preferences with the rendered application."
  ),
  component(
    "RootErrorBoundary",
    "components/layout/root-error-boundary.tsx",
    "Layout",
    "infrastructure",
    "internal",
    "Catches render errors outside the router's reach and offers a reload instead of a white screen."
  ),
  component(
    "OfflineIndicator",
    "components/layout/offline-indicator.tsx",
    "Layout",
    "pattern",
    "reference",
    "Communicates loss and recovery of network connectivity."
  ),
  component(
    "SidebarNav",
    "components/layout/sidebar-nav.tsx",
    "Layout",
    "pattern",
    "reference",
    "Renders the primary desktop navigation and active-route state."
  ),
  component(
    "ThemeController",
    "components/layout/theme-controller.tsx",
    "Layout",
    "infrastructure",
    "internal",
    "Applies persisted theme and accent preferences to the document."
  ),
  component(
    "ThemeToggle",
    "components/layout/theme-toggle.tsx",
    "Layout",
    "pattern",
    "reference",
    "Switches between light and dark appearance modes."
  ),
  component(
    "LibraryEditor",
    "components/library/library-editor.tsx",
    "Library",
    "feature",
    "reference",
    "Edits saved library metadata and user-specific media state."
  ),
  component(
    "AvailabilityAlertButton",
    "components/media/availability-alert-button.tsx",
    "Media",
    "feature",
    "reference",
    "Creates or removes an alert for provider availability."
  ),
  component(
    "CastList",
    "components/media/cast-list.tsx",
    "Media",
    "pattern",
    "live",
    "Displays principal cast members and their character names."
  ),
  component(
    "CatalogueBrowse",
    "components/media/catalogue-browse.tsx",
    "Media",
    "pattern",
    "live",
    "Links out to genre- and platform-filtered search results."
  ),
  component(
    "CatalogueSections",
    "components/media/catalogue-sections.tsx",
    "Media",
    "pattern",
    "live",
    "Renders the shared trending/top-rated/upcoming rows used by both the home dashboard and Search's default browse state."
  ),
  component(
    "EpisodeCard",
    "components/media/episode-card.tsx",
    "Media",
    "pattern",
    "reference",
    "Summarizes an episode and exposes watch-state actions."
  ),
  component(
    "FilterBar",
    "components/media/filter-bar.tsx",
    "Media",
    "pattern",
    "live",
    "Combines media-type filters with count-aware selection controls."
  ),
  component(
    "LoadMoreButton",
    "components/media/load-more-button.tsx",
    "Media",
    "pattern",
    "live",
    "Offers explicit and intersection-driven pagination."
  ),
  component(
    "MediaCard",
    "components/media/media-card.tsx",
    "Media",
    "pattern",
    "live",
    "Presents poster art, metadata and primary media actions."
  ),
  component(
    "MediaDetailsHero",
    "components/media/media-details-hero.tsx",
    "Media",
    "feature",
    "reference",
    "Composes backdrop, title, synopsis and detail-page actions."
  ),
  component(
    "MediaGrid",
    "components/media/media-grid.tsx",
    "Media",
    "pattern",
    "live",
    "Lays out responsive collections of media cards."
  ),
  component(
    "NextEpisodeCard",
    "components/media/next-episode-card.tsx",
    "Media",
    "feature",
    "reference",
    "Highlights the next episode available to continue."
  ),
  component(
    "Pill",
    "components/media/pill.tsx",
    "Media",
    "primitive",
    "live",
    "Displays compact media metadata or categorical labels."
  ),
  component(
    "ProgressBar",
    "components/media/progress-bar.tsx",
    "Media",
    "pattern",
    "live",
    "Visualizes bounded watch progress with an optional label and percentage."
  ),
  component(
    "ProviderAvailability",
    "components/media/provider-availability.tsx",
    "Media",
    "feature",
    "reference",
    "Groups streaming, rental and purchase provider options."
  ),
  component(
    "RecommendationsPanel",
    "components/media/recommendations-panel.tsx",
    "Media",
    "feature",
    "reference",
    "Displays related titles and discovery recommendations."
  ),
  component(
    "SearchBar",
    "components/media/search-bar.tsx",
    "Media",
    "pattern",
    "live",
    "Provides a labelled search field with clear and submit behavior."
  ),
  component(
    "SeasonAccordion",
    "components/media/season-accordion.tsx",
    "Media",
    "feature",
    "reference",
    "Groups episodes by season using accessible disclosure controls."
  ),
  component(
    "SectionHeader",
    "components/media/section-header.tsx",
    "Media",
    "pattern",
    "live",
    "Introduces repeated page sections with optional copy and actions."
  ),
  component(
    "SeenToggle",
    "components/media/seen-toggle.tsx",
    "Media",
    "feature",
    "reference",
    "Toggles watched state for a movie or episode."
  ),
  component(
    "StatCard",
    "components/media/stat-card.tsx",
    "Media",
    "pattern",
    "live",
    "Presents a metric, context label and optional trend."
  ),
  component(
    "TrailerPanel",
    "components/media/trailer-panel.tsx",
    "Media",
    "feature",
    "reference",
    "Surfaces playable trailers and fallback messaging."
  ),
  component(
    "WatchNextSection",
    "components/media/watch-next-section.tsx",
    "Media",
    "feature",
    "reference",
    "Composes prioritized continue-watching recommendations."
  ),
  component(
    "AddToLibraryButton",
    "components/media/add-to-library-button.tsx",
    "Media",
    "feature",
    "reference",
    "Adds or removes a title from the library."
  ),
  component(
    "BackupTools",
    "components/settings/backup-tools.tsx",
    "Settings",
    "feature",
    "reference",
    "Exports, imports and restores portable application data."
  ),
  component(
    "DesktopSettings",
    "components/settings/desktop-settings.tsx",
    "Settings",
    "feature",
    "reference",
    "Configures desktop integration and startup behavior."
  ),
  component(
    "TvTimeImportCard",
    "components/settings/tvtime-import-card.tsx",
    "Settings",
    "feature",
    "reference",
    "Imports viewing history from a TV Time export."
  ),
  component(
    "EmptyState",
    "components/states/empty-state.tsx",
    "States",
    "pattern",
    "live",
    "Explains an empty result and offers a relevant next action."
  ),
  component(
    "LoadingScreen",
    "components/states/loading-screen.tsx",
    "States",
    "pattern",
    "internal",
    "Full-screen busy indicator shown while auth session or profile resolution is in flight."
  ),
  component(
    "LoadingSkeletons",
    "components/states/loading-skeletons.tsx",
    "States",
    "pattern",
    "live",
    "Mirrors page geometry while remote content is loading."
  ),
  component(
    "LoadingState",
    "components/states/loading-state.tsx",
    "States",
    "pattern",
    "live",
    "Inline text loading notice for a page section, as opposed to a full-page skeleton or LoadingScreen."
  ),
  component(
    "PartialErrorState",
    "components/states/partial-error-state.tsx",
    "States",
    "pattern",
    "live",
    "Reports a secondary/partial fetch failure alongside otherwise-successful content, with an optional retry."
  ),
  component(
    "RemoteErrorState",
    "components/states/remote-error-state.tsx",
    "States",
    "pattern",
    "live",
    "Maps remote and local failures to contextual recovery guidance."
  ),
  component(
    "Accordion",
    "components/ui/accordion.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Provides accessible single or multiple disclosure groups."
  ),
  component(
    "AsyncActionFeedback",
    "components/ui/async-action-feedback.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Reports the result of a button-triggered async action (plain, neutral, success or error tone)."
  ),
  component(
    "Badge",
    "components/ui/badge.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Displays compact status, category or media-type information."
  ),
  component(
    "Button",
    "components/ui/button.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Expresses action hierarchy, size and risk."
  ),
  component(
    "Card",
    "components/ui/card.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Groups independent content with a shared surface recipe."
  ),
  component(
    "ConfirmDialog",
    "components/ui/confirm-dialog.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Gates an irreversible action behind an explicit confirm/cancel choice."
  ),
  component(
    "FormField",
    "components/ui/form-field.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Composes a label with optional help/error text, wired to its control via aria-describedby."
  ),
  component(
    "Input",
    "components/ui/input.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Collects single-line text and search values."
  ),
  component(
    "Panel",
    "components/ui/panel.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Groups related content on a flat semantic surface."
  ),
  component(
    "Progress",
    "components/ui/progress.tsx",
    "UI primitives",
    "primitive",
    "reference",
    "Wraps the accessible Radix progress primitive."
  ),
  component(
    "Select",
    "components/ui/select.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Collects one value using native select semantics."
  ),
  component(
    "Separator",
    "components/ui/separator.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Creates semantic horizontal or vertical separation."
  ),
  component(
    "SettingToggle",
    "components/ui/setting-toggle.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Renders an on/off preference as a pressed-state button."
  ),
  component(
    "Sheet",
    "components/ui/sheet.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Provides an accessible edge-anchored modal surface."
  ),
  component(
    "Skeleton",
    "components/ui/skeleton.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Represents a single loading placeholder shape."
  ),
  component(
    "Toast",
    "components/ui/toast.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Radix-backed toast primitives (Provider/Viewport/Root/Title/Description/Close/Action) used by Toaster."
  ),
  component(
    "Toaster",
    "components/ui/toaster.tsx",
    "UI primitives",
    "infrastructure",
    "live",
    "Mounted once at the app root; renders every toast(...) call as a stacked notification."
  ),
  component(
    "Textarea",
    "components/ui/textarea.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Collects multi-line text with shared focus and disabled states."
  ),
  component(
    "Tile",
    "components/ui/tile.tsx",
    "UI primitives",
    "primitive",
    "live",
    "Provides a compact bordered container for dense rows."
  ),
] satisfies readonly ComponentInventoryItem[];
