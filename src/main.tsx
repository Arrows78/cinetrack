import React from "react";
import ReactDOM from "react-dom/client";
import { defaultShouldDehydrateQuery } from "@tanstack/react-query";
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
          // Only persist `local.*` (SQLite-backed) queries to localStorage.
          // `remote.*` (TMDB discover/search/images) already has its own
          // staleTime/gcTime in-memory caching and can grow unbounded as the
          // user browses — persisting it too risked exhausting the
          // localStorage quota as the library grows.
          dehydrateOptions: {
            shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) && query.queryKey[0] === "local",
          },
        }}
      >
        <AuthRoot>
          <App />
        </AuthRoot>
      </PersistQueryClientProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);
