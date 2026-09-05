import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";
import { HomePage } from "@/pages/home-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { ErrorComponent, PendingComponent, RootLayout } from "./router-components";

// Every other page is code-split via lazyRouteComponent: eagerly importing
// all 14 pages here put every page's code (and its transitive imports) in
// the initial bundle regardless of which route the user opened first.
// HomePage stays eager since it's needed immediately on a first launch
// anyway; `defaultPreload: "intent"` below still prefetches lazy routes on
// link hover/focus, so navigation doesn't feel any slower.
const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFoundPage });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});
const moviesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/movies",
  component: lazyRouteComponent(() => import("@/pages/movies-page"), "MoviesPage"),
});
const movieDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/movies/$movieId",
  component: lazyRouteComponent(() => import("@/pages/movie-detail-page"), "MovieDetailPage"),
});
const seriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/series",
  component: lazyRouteComponent(() => import("@/pages/series-page"), "SeriesPage"),
});
const seriesDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/series/$seriesId",
  // `season`: an entry point (a home-dashboard rail, an availability alert)
  // that already knows which season is relevant can open the full series
  // page with that season's accordion pre-expanded, instead of dropping the
  // user onto the isolated single-season route with no way back to the
  // rest of the show.
  validateSearch: z.object({ season: z.coerce.number().int().positive().optional() }),
  component: lazyRouteComponent(() => import("@/pages/series-detail-page"), "SeriesDetailPage"),
});
const seasonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/series/$seriesId/season/$seasonNumber",
  component: lazyRouteComponent(() => import("@/pages/season-page"), "SeasonPage"),
});
const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  component: lazyRouteComponent(() => import("@/pages/search-page"), "SearchPage"),
});
const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  component: lazyRouteComponent(() => import("@/pages/library-page"), "LibraryPage"),
});
const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: lazyRouteComponent(() => import("@/pages/history-page"), "HistoryPage"),
});
const trackingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tracking",
  component: lazyRouteComponent(() => import("@/pages/tracking-page"), "TrackingPage"),
});
const peopleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/people",
  component: lazyRouteComponent(() => import("@/pages/people-page"), "PeoplePage"),
});
const personDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/people/$personId",
  component: lazyRouteComponent(() => import("@/pages/person-detail-page"), "PersonDetailPage"),
});
const watchTonightRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/watch-tonight",
  component: lazyRouteComponent(() => import("@/pages/watch-tonight-page"), "WatchTonightPage"),
});
const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/stats",
  component: lazyRouteComponent(() => import("@/pages/stats-page"), "StatsPage"),
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: lazyRouteComponent(() => import("@/pages/settings-page"), "SettingsPage"),
});
// Dev-only token/component catalog — import.meta.env.DEV is statically
// replaced at build time, so Rollup drops both this route and its dynamic
// import (and everything it pulls in) from the production bundle entirely.
const designSystemRoute = import.meta.env.DEV
  ? createRoute({
      getParentRoute: () => rootRoute,
      path: "/design-system",
      component: lazyRouteComponent(() => import("@/pages/design-system-page"), "DesignSystemPage"),
    })
  : null;

const routeTree = rootRoute.addChildren([
  indexRoute,
  moviesRoute,
  movieDetailRoute,
  seriesRoute,
  seriesDetailRoute,
  seasonRoute,
  searchRoute,
  libraryRoute,
  historyRoute,
  trackingRoute,
  peopleRoute,
  personDetailRoute,
  watchTonightRoute,
  statsRoute,
  settingsRoute,
  ...(designSystemRoute ? [designSystemRoute] : []),
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
