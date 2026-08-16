import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge doesn't know about the custom font-size scale added in
// tailwind.config.ts (display-hero/display-title/heading-*/body*/caption/
// overline) — its default "font-size" validator only recognizes Tailwind's
// stock text-xs..text-9xl keywords, so an unrecognized `text-{key}` falls
// through to the permissive "text-color" group's catch-all instead. That
// silently drops whichever `text-{color}` class appears earlier in the same
// cn() call as a "conflict" — e.g. `cn("... text-primary-foreground", "...
// text-overline ...")` loses the color entirely, no error, no warning.
// Registering these keys under "font-size" here is what actually fixes it,
// not fixing it call-site by call-site.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-hero",
            "display-title",
            "heading-lg",
            "heading-md",
            "heading-sm",
            "body-lg",
            "body",
            "body-sm",
            "caption",
            "overline",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
