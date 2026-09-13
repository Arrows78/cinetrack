import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Filters `candidateIds` down to the ones actually mounted under
 * `containerRef` right now, for a jump nav whose targets can appear or
 * disappear as async data resolves (see home-page.tsx's self-contained
 * sections, several of which render nothing when they have no content). A
 * MutationObserver keeps the list current without requiring each section to
 * report its own visibility back up to the caller.
 *
 * Keys the effect off the ids' joined content rather than the array
 * reference, same reasoning as useActiveSection — a caller passing
 * `candidateIds` inline would otherwise reconnect the observer (and
 * setPresentIds) on every render, an infinite loop once that state update
 * itself triggers the next render.
 */
export function usePresentSectionIds(candidateIds: readonly string[], containerRef: RefObject<HTMLElement | null>) {
  const [presentIds, setPresentIds] = useState<string[]>([]);
  const key = candidateIds.join(" ");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const recompute = () => {
      setPresentIds(candidateIds.filter((id) => document.getElementById(id) !== null));
    };

    recompute();
    const observer = new MutationObserver(recompute);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` already encodes candidateIds' content; containerRef is a stable ref object
  }, [key, containerRef]);

  return presentIds;
}
