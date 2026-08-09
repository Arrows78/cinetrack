import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "@/app/App";
import { AuthRoot } from "@/features/auth/auth-root";
import { RootErrorBoundary } from "@/components/layout/root-error-boundary";
import { queryClient } from "@/app/query-client";
import "@/i18n";
// Self-hosted fonts (see src/styles/index.css's comment for why these are
// imported here rather than via a CSS @import) — offline, no third-party
// CDN, and no CSP allowance needed for fonts.googleapis.com/fontshare.com.
import "@fontsource-variable/dm-sans/opsz.css";
import "@fontsource-variable/dm-sans/opsz-italic.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/playfair-display/900.css";
import "@fontsource/playfair-display/400-italic.css";
import "@fontsource/playfair-display/600-italic.css";
import "@fontsource/syne/400.css";
import "@fontsource/syne/500.css";
import "@fontsource/syne/600.css";
import "@fontsource/syne/700.css";
import "@fontsource/syne/800.css";
import "@/styles/index.css";

// One-time cleanup for installs upgrading from a version that persisted
// local.* query data (watchlist/library/history/notes/preferences) to
// localStorage — removing the persister going forward doesn't erase what
// it already wrote. Safe to call unconditionally: a no-op once the key is
// gone.
window.localStorage.removeItem("cinetrack.query-cache.v1");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthRoot>
          <App />
        </AuthRoot>
      </QueryClientProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);
