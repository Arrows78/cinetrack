import type { MouseEvent } from "react";
import { useActiveSection } from "@/hooks/use-active-section";
import { cn } from "@/shared/lib/cn";

export interface SectionNavItem {
  id: string;
  label: string;
}

// A plain `href="#id"` click changes location.hash, which the app router's
// history listener picks up as a real location change regardless of which
// element caused it — and its scrollRestoration then "restores" the scroll
// position for what it treats as a fresh entry, undoing the browser's own
// native jump right after it happens. Scrolling manually and preventing the
// default hash navigation avoids the router ever seeing this as a
// navigation at all. `href` is kept on the anchor for what it still gets
// right natively (middle-click/open-in-new-tab, right-click "copy link").
function jumpToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

/**
 * Sticky pill-style jump nav for a long page broken into `id`-anchored
 * sections (see design-system-page.tsx and home-page.tsx). Hides itself
 * below two items — a nav that can only ever point at the section you're
 * already looking at isn't worth the chrome.
 */
export function SectionNav({
  items,
  ariaLabel,
  className,
}: {
  items: readonly SectionNavItem[];
  ariaLabel: string;
  className?: string;
}) {
  const activeSection = useActiveSection(items.map((item) => item.id));

  if (items.length < 2) return null;

  return (
    <nav
      className={cn(
        "sticky top-20 z-sticky -mx-4 flex gap-1 overflow-x-auto border-y border-border bg-background/90 px-4 py-2 backdrop-blur-md lg:top-0 lg:-mx-6 lg:px-6",
        className
      )}
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          onClick={(event) => jumpToSection(event, item.id)}
          aria-current={activeSection === item.id ? "location" : undefined}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeSection === item.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
