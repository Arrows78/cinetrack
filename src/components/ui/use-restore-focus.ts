import { useCallback, useRef } from "react";

/**
 * Props for a Radix `Dialog.Content` that is opened by state rather than by a
 * `Dialog.Trigger`. Radix only returns focus to its own trigger, so without
 * this a keyboard user who closes such a dialog lands back on `<body>` and
 * loses their place on the page. The element focused when the dialog opened
 * gets focus back on close, unless it has left the document in the meantime
 * (e.g. the row that opened a delete confirmation was itself deleted).
 */
export function useRestoreFocus() {
  const openerRef = useRef<HTMLElement | null>(null);

  const onOpenAutoFocus = useCallback(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  const onCloseAutoFocus = useCallback((event: Event) => {
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) {
      event.preventDefault();
      opener.focus();
    }
  }, []);

  return { onOpenAutoFocus, onCloseAutoFocus };
}
