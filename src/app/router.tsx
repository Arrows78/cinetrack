import { RouterProvider } from "@tanstack/react-router";

import { router } from "./router-config";

export function AppRouter() {
  return <RouterProvider router={router} />;
}
