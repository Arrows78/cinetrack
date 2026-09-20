import { useState } from "react";
import { Button } from "@/components/ui/button";
import { captureShortcutFromEvent, formatShortcutForDisplay } from "@/shared/lib/keyboard-shortcut";
import { isMacOs } from "@/shared/lib/platform";

/**
 * A single-button control that captures a keyboard shortcut: click (or
 * focus) to start recording, then press the desired combo. A modifier-less
 * keypress (e.g. plain "K") is silently ignored — see
 * captureShortcutFromEvent's own doc comment — so recording stays open
 * until a real combo is pressed, rather than accepting something that would
 * fire while typing anywhere else in the app.
 */
export function ShortcutInput({
  label,
  value,
  onChange,
  recordingLabel,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  recordingLabel: string;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const isMac = isMacOs();

  return (
    <Button
      type="button"
      variant={recording ? "secondary" : "outline"}
      size="sm"
      disabled={disabled}
      aria-label={recording ? recordingLabel : label}
      className="font-mono"
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(event) => {
        if (!recording) return;
        event.preventDefault();
        if (event.key === "Escape") {
          setRecording(false);
          return;
        }
        const captured = captureShortcutFromEvent(event.nativeEvent);
        if (!captured) return;
        onChange(captured);
        setRecording(false);
      }}
    >
      {recording ? recordingLabel : formatShortcutForDisplay(value, isMac)}
    </Button>
  );
}
