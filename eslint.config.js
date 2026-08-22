import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import i18next from "eslint-plugin-i18next";
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
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
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
