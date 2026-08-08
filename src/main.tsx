import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "@/app/App";
import { AuthRoot } from "@/features/auth/auth-root";
import { RootErrorBoundary } from "@/components/layout/root-error-boundary";
import { queryClient } from "@/app/query-client";
import "@/i18n";
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
