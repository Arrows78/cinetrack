import { env } from "@/shared/config/env";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConfigurationError";
  }
}

export async function tmdbFetch<T>(path: string, params?: Record<string, string | number | undefined>) {
  if (!env.VITE_TMDB_API_TOKEN) {
    throw new ApiConfigurationError(
      "VITE_TMDB_API_TOKEN is missing. Provide a TMDB bearer token to enable remote data."
    );
  }

  const url = new URL(`${TMDB_BASE_URL}${path}`);

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${env.VITE_TMDB_API_TOKEN}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`TMDB ${response.status}: ${message}`);
  }

  return (await response.json()) as T;
}
