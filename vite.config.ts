import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  // Lets the "node" test environment (see the @vitest-environment pragma in
  // SQLite-backed test files) actually bundle the node:sqlite built-in —
  // without this, Vite still treats those files as "client"/browser code.
  environments: {
    node: {
      resolve: {
        conditions: ["node", "browser"],
      },
      noExternal: true,
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    // Only binds to every network interface when TAURI_DEV_HOST is set —
    // that's Tauri's own mobile CLI (`tauri android/ios dev`) exporting it
    // to reach a physical device on the LAN. Plain `pnpm dev`/`pnpm tauri dev`
    // has no such need and shouldn't expose the dev server to the network by
    // default.
    host: process.env.TAURI_DEV_HOST || "localhost",
    hmr: process.env.TAURI_DEV_HOST
      ? {
          protocol: "ws",
          host: process.env.TAURI_DEV_HOST,
          port: 1421,
        }
      : undefined,
  },
  build: {
    rollupOptions: {
      output: {
        // Bare-specifier object form (`{ "vendor-react": ["react"] }`) silently
        // failed to match react/react-dom (produced an empty chunk). Matching
        // by substring on the full id is also unreliable under pnpm: its
        // virtual store encodes peer deps into the folder name (e.g.
        // ".pnpm/@tanstack+react-router@.._react-dom@19.2.8_.."), so an
        // `id.includes("react-dom")` check matched react-router's own folder
        // name, not the real react-dom package. Only the path segment after
        // the last "node_modules/" is the real resolved package.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          const pkgPath = id.split("node_modules/").pop() ?? "";

          if (pkgPath.startsWith("react-dom/") || pkgPath.startsWith("react/") || pkgPath.startsWith("scheduler/")) {
            return "vendor-react";
          }
          if (pkgPath.startsWith("@tanstack/react-router/")) return "vendor-router";
          if (pkgPath.startsWith("@tanstack/react-query/") || pkgPath.startsWith("@tanstack/query-core/")) {
            return "vendor-query";
          }
          if (
            pkgPath.startsWith("framer-motion/") ||
            pkgPath.startsWith("lucide-react/") ||
            pkgPath.startsWith("class-variance-authority/") ||
            pkgPath.startsWith("clsx/") ||
            pkgPath.startsWith("tailwind-merge/")
          ) {
            return "vendor-ui";
          }
          if (pkgPath.startsWith("@supabase/supabase-js/")) return "vendor-supabase";
          if (pkgPath.startsWith("i18next/") || pkgPath.startsWith("react-i18next/")) return "vendor-i18n";
          return undefined;
        },
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
}));
