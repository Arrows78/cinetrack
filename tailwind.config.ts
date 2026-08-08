import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Syne", "Playfair Display", "Georgia", "serif"],
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        // Playfair Display was only ever a fallback inside `display` (Syne
        // always loads, so it never actually rendered). Its own family, for
        // the one place an editorial serif earns its keep: synopsis text
        // (see movie/series detail pages) — a quiet nod to the "programme
        // note" register of a film synopsis, not a display face.
        serif: ["Playfair Display", "Georgia", "serif"],
      },
      // Semantic type roles, additive to Tailwind's default text-xs..text-9xl
      // scale (still available and still what every existing component
      // uses). This is the target vocabulary for new/future UI — adopting it
      // across existing components is a separate, larger follow-up.
      fontSize: {
        "display-hero": ["3.5rem", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "800" }],
        "display-title": ["2.25rem", { lineHeight: "1.15", letterSpacing: "-0.01em", fontWeight: "700" }],
        "heading-lg": ["1.5rem", { lineHeight: "1.25", fontWeight: "600" }],
        "heading-md": ["1.25rem", { lineHeight: "1.3", fontWeight: "600" }],
        "heading-sm": ["1.125rem", { lineHeight: "1.35", fontWeight: "600" }],
        "body-lg": ["1.0625rem", { lineHeight: "1.6" }],
        body: ["0.9375rem", { lineHeight: "1.6" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.5" }],
        caption: ["0.75rem", { lineHeight: "1.4" }],
        overline: ["0.625rem", { lineHeight: "1.3", letterSpacing: "0.3em", fontWeight: "600" }],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        rating: "hsl(var(--rating))",
        // Theme-invariant tokens for the always-dark auth screen — see
        // styles/index.css for why it can't use the regular light/dark tokens.
        "auth-surface": "hsl(var(--auth-surface))",
        "auth-destructive": "hsl(var(--auth-destructive))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Surface scale (posters → hero panels). Single source of truth in
        // styles/index.css; use these instead of rounded-[Npx] literals.
        card: "var(--radius-card)",
        panel: "var(--radius-panel)",
        shell: "var(--radius-shell)",
        hero: "var(--radius-hero)",
      },
      boxShadow: {
        // Follows the runtime accent color (--primary is set by ThemeController).
        glow: "var(--shadow-glow)",
        "glow-lg": "var(--shadow-glow-lg)",
        // Elevation scale, single source of truth in styles/index.css.
        // Namespaced "elevation-*" — NOT shadow-sm/xl/2xl, which already
        // resolve to Tailwind's own defaults in active use elsewhere.
        "elevation-xs": "var(--shadow-xs)",
        "elevation-sm": "var(--shadow-sm)",
        "elevation-md": "var(--shadow-md)",
        "elevation-lg": "var(--shadow-lg)",
        "elevation-xl": "var(--shadow-xl)",
      },
      // Named additions to Tailwind's default numeric duration scale,
      // covering every duration-* value already used across components
      // (200/300/500/600/700/1000ms) so any of them can be referred to by
      // name without changing the actual rendered duration.
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        medium: "var(--duration-medium)",
        slow: "var(--duration-slow)",
        slower: "var(--duration-slower)",
        slowest: "var(--duration-slowest)",
      },
      // "out-expo" — NOT "out", which is Tailwind's own default ease-out.
      transitionTimingFunction: {
        "out-expo": "var(--ease-out-expo)",
      },
      // Named additions to Tailwind's default numeric z-index scale (z-10
      // etc. stay available and in use elsewhere). Values documented here
      // rather than as CSS vars — nothing dynamic touches them at runtime.
      // The decorative body::before/::after layers in styles/index.css sit
      // deliberately above this whole scale (z-index: 9997/9998) as a
      // special-cased always-on-top overlay, not a stacking tier new UI
      // should ever need to clear.
      zIndex: {
        raised: "10", // matches existing z-10 usages
        sticky: "30", // matches the mobile header's existing z-30
        dropdown: "40",
        overlay: "50", // matches Sheet/Dialog's existing z-50
        modal: "50",
        toast: "60",
        "command-palette": "100", // matches command-palette.tsx's existing z-[100]
      },
      animation: {
        shimmer: "shimmer 2s infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
