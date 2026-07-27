import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { HomePage } from "@/pages/home-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { ErrorComponent, PendingComponent, RootLayout } from "./router-components";

// Every other page is code-split via lazyRouteComponent: eagerly importing
// all 16 pages here put every page's code (and its transitive imports) in
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
const watchlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/watchlist",
  component: lazyRouteComponent(() => import("@/pages/watchlist-page"), "WatchlistPage"),
});
const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: lazyRouteComponent(() => import("@/pages/history-page"), "HistoryPage"),
});
const collectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/collections",
  component: lazyRouteComponent(() => import("@/pages/collections-page"), "CollectionsPage"),
});
const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/calendar",
  component: lazyRouteComponent(() => import("@/pages/calendar-page"), "CalendarPage"),
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
  collectionsRoute,
  calendarRoute,
  peopleRoute,
  personDetailRoute,
  watchTonightRoute,
  statsRoute,
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
