import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import i18next from "eslint-plugin-i18next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // .claude isn't project source (session state, and any worktrees created
    // via the worktree tool land under .claude/worktrees/ — their own files
    // shouldn't be picked up when linting from the main checkout).
    ignores: ["dist", "src-tauri/target", "*.config.cjs", ".claude"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...jsxA11y.flatConfigs.recommended,
    files: ["src/**/*.{ts,tsx}"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      i18next,
      boundaries,
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
      },
      // Only the layers with an actual rule below are modeled — deliberately
      // not a full classification of src/** (that would need `no-unknown`
      // too). components/pages -> feature-internal-module imports ARE
      // enforced, just not here: scripts/check-feature-boundaries.mjs (run
      // by `pnpm architecture:check`) walks components/ and pages/ the same
      // way it walks feature-to-feature imports, since expressing "may only
      // import index.ts/*-repository.ts/use-*.ts" isn't something
      // eslint-plugin-boundaries' element/pattern model can say. See the
      // "Architecture boundaries" section of docs/architecture.md.
      "boundaries/elements": [
        { type: "shared", pattern: "src/shared/**" },
        { type: "ui-primitives", pattern: "src/components/ui/**" },
        { type: "features", pattern: "src/features/*/**" },
        { type: "pages", pattern: "src/pages/**" },
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Dependency direction from docs/architecture.md's "Architecture
      // boundaries" section — shared/ and components/ui/ are the lowest
      // layer and must stay reusable outside any one feature or page.
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: { element: { type: "shared" } },
              disallow: [{ to: { element: { type: "features" } } }, { to: { element: { type: "pages" } } }],
              message:
                "src/shared/** must not depend on a feature or page — it's the layer every feature/page depends on, not the other way round. See docs/architecture.md.",
            },
            {
              from: { element: { type: "ui-primitives" } },
              disallow: [{ to: { element: { type: "features" } } }, { to: { element: { type: "pages" } } }],
              message:
                "src/components/ui/** primitives must not depend on business-domain code — put domain-aware composition in components/media, components/states, etc. instead. See docs/architecture.md.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],
      // Every user-facing JSX text node or attribute (aria-label, placeholder,
      // title...) must go through t("namespace.key") — see CLAUDE.md's
      // "Non-negotiables > i18n". `words.exclude` is the allowlist for
      // legitimate non-copy literals: brand/product names TMDB never
      // localizes and typographic punctuation used as a bare separator.
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-only",
          "jsx-attributes": {
            exclude: [
              "className",
              "listClassName",
              "itemClassName",
              "rowClassName",
              "indicatorClassName",
              "styleName",
              "style",
              "type",
              "key",
              "id",
              "width",
              "height",
              "to",
              "href",
              "src",
              // Option/enum values and ARIA element-id references — data,
              // not copy. The rendered label next to them still goes
              // through t().
              "value",
              "aria-describedby",
              "aria-labelledby",
              "aria-controls",
              "aria-owns",
            ],
          },
          "object-properties": {
            // "to" mirrors the same key already excluded above under
            // jsx-attributes — a route path used to build an array of
            // `{ to, icon, label, desc }` link descriptors (see
            // home-page.tsx's offline-mode quick links) is data, not copy,
            // whether it lands as a JSX attribute or as a plain object
            // property along the way.
            exclude: ["[A-Z_-]+", "scope", "to"],
          },
          words: {
            exclude: [
              "[0-9!-/:-@[-`{-~]+",
              "[A-Z_-]+",
              "CineTrack",
              "TMDB",
              "Supabase",
              "TV Time",
              "Esc",
              "•",
              "·",
              "—",
              "★",
              "-",
              "\\|",
            ],
          },
        },
      ],
    },
  },
  {
    // The design system showcase is internal developer documentation, not
    // product copy — its section titles, sample placeholders and demo
    // labels are intentionally hardcoded and never shown to end users.
    files: ["src/pages/design-system-page.tsx", "src/pages/design-system/**/*.tsx"],
    rules: {
      "i18next/no-literal-string": "off",
    },
  },
  {
    files: ["src/**/__tests__/**/*.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    rules: {
      "i18next/no-literal-string": "off",
    },
  },
  prettier
);
