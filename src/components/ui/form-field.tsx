import { useId, type ReactNode } from "react";

interface FormFieldProps {
  label: string;
  help?: string;
  error?: string;
  children: (describedById: string | undefined) => ReactNode;
}

/** A labeled control with optional help/error text, wired up via aria-describedby. */
export function FormField({ label, help, error, children }: FormFieldProps) {
  const helpId = useId();
  const errorId = useId();
  const describedBy = error ? errorId : help ? helpId : undefined;

  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children(describedBy)}
      {error ? (
        <span id={errorId} className="text-xs font-normal text-destructive">
          {error}
        </span>
      ) : help ? (
        <span id={helpId} className="text-xs font-normal text-muted-foreground">
          {help}
        </span>
      ) : null}
    </label>
  );
}
