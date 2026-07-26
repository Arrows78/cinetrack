import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

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

import { ErrorComponent, PendingComponent, RootLayout } from "./router-components";

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
  defaultPendingComponent: PendingComponent,
  defaultErrorComponent: ErrorComponent,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
