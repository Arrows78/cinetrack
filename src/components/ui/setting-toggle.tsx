import { Button } from "@/components/ui/button";

interface SettingToggleProps {
  label: string;
  pressed: boolean;
  onPressedChange: () => void;
  disabled?: boolean;
}

/** An on/off preference rendered as a pressed-state button — label, help text and error live outside, in the caller. */
export function SettingToggle({ label, pressed, onPressedChange, disabled }: SettingToggleProps) {
  return (
    <Button
      variant={pressed ? "secondary" : "outline"}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onPressedChange}
    >
      {label}
    </Button>
  );
}
