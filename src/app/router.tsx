import { RouterProvider, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { HistoryPage } from "@/pages/history-page";
import { HomePage } from "@/pages/home-page";
import { MovieDetailPage } from "@/pages/movie-detail-page";
import { MoviesPage } from "@/pages/movies-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { SearchPage } from "@/pages/search-page";
import { SeasonPage } from "@/pages/season-page";
import { SeriesDetailPage } from "@/pages/series-detail-page";
import { SeriesPage } from "@/pages/series-page";
import { SettingsPage } from "@/pages/settings-page";
import { WatchlistPage } from "@/pages/watchlist-page";

function RootLayout() {
  return <AppShell />;
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const moviesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/movies",
  component: MoviesPage,
});

const movieDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/movies/$movieId",
  component: MovieDetailPage,
});

const seriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/series",
  component: SeriesPage,
});

const seriesDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/series/$seriesId",
  component: SeriesDetailPage,
});

const seasonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/series/$seriesId/season/$seasonNumber",
  component: SeasonPage,
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  component: SearchPage,
});

const watchlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/watchlist",
  component: WatchlistPage,
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: HistoryPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  moviesRoute,
  movieDetailRoute,
  seriesRoute,
  seriesDetailRoute,
  seasonRoute,
  searchRoute,
  watchlistRoute,
  historyRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultPendingComponent: () => <div className="p-6 text-sm text-muted-foreground">Chargement…</div>,
  defaultErrorComponent: ({ error }) => (
    <div className="surface rounded-[32px] p-6">
      <h2 className="text-xl font-semibold">Une erreur est survenue</h2>
      <p className="mt-3 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
