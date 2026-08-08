import React from "react";
import ReactDOM from "react-dom/client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { App } from "@/app/App";
import { AuthRoot } from "@/features/auth/auth-root";
import { RootErrorBoundary } from "@/components/layout/root-error-boundary";
import { queryClient, queryPersister } from "@/app/query-client";
import "@/i18n";
import "@/styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister,
          maxAge: 1000 * 60 * 60 * 24 * 7,
          buster: "cinetrack-v2",
        }}
      >
        <AuthRoot>
          <App />
        </AuthRoot>
      </PersistQueryClientProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);
