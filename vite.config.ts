import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(() => ({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || "0.0.0.0",
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
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-router": ["@tanstack/react-router"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-ui": ["framer-motion", "lucide-react", "class-variance-authority", "clsx", "tailwind-merge"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-i18n": ["i18next", "react-i18next"],
        },
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
}));
