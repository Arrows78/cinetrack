/**
 * Raw gradient/color values used purely as decorative art or image-legibility
 * scrims — not semantic UI colors, so they don't belong in the theme token
 * system (styles/index.css). Centralized here instead of inline object
 * literals in component code, per the design system's reference-token layer
 * (see docs/design-system.md).
 */

/**
 * Auth screen backdrop — twelve distinct two-color moods for the mock
 * "movie poster" tile collage (see auth-backdrop.tsx). Deliberately varied
 * and arbitrary (each tile is a different fictional film), so there's no
 * semantic role to map these to; they're reference values by nature, not a
 * gap in the token system.
 */
export const AUTH_BACKDROP_TILE_GRADIENTS: readonly string[] = [
  "linear-gradient(145deg, #161a28, #2c3658)",
  "linear-gradient(145deg, #3b1116, #8a272d)",
  "linear-gradient(145deg, #0f2430, #1d5a70)",
  "linear-gradient(145deg, #251147, #6d25a8)",
  "linear-gradient(145deg, #1e1e1e, #585858)",
  "linear-gradient(145deg, #3a220b, #9c661e)",
  "linear-gradient(145deg, #12261d, #34704f)",
  "linear-gradient(145deg, #101825, #314976)",
  "linear-gradient(145deg, #3c142f, #9e3d77)",
  "linear-gradient(145deg, #33291c, #8c7048)",
  "linear-gradient(145deg, #121f39, #315eab)",
  "linear-gradient(145deg, #17131d, #4d3b60)",
];

/** Glossy highlight overlaid on each backdrop tile above. */
export const AUTH_BACKDROP_TILE_SHEEN = "radial-gradient(circle at 50% 20%, rgba(255,255,255,0.2), transparent 45%)";

/**
 * Film-sprocket perforation strip along a backdrop tile's top/bottom edge
 * (see auth-backdrop.tsx) — a decorative nod to a 35mm filmstrip, not a
 * real photograph, so it stays a plain repeating pattern rather than an
 * image asset.
 */
export const FILM_SPROCKET_PATTERN = "repeating-linear-gradient(to right, rgba(0,0,0,0.85) 0 3px, transparent 3px 7px)";

/**
 * Poster-image legibility scrim (see media-card.tsx) — darkens the bottom of
 * a poster so the title/meta text stays readable. Always black regardless of
 * theme: it composites over a photograph, not a themed app surface, the same
 * way a photo caption's backing stays dark in both a light- and dark-mode
 * gallery app.
 */
export const MEDIA_POSTER_SCRIM =
  "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)";
