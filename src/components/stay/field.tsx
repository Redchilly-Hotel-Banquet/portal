import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Label, control, hint and inline error. Controls should set
 * aria-invalid={!!error} and aria-describedby={fieldDescribedBy(id, !!error, !!hint)}.
 */
export function Field({ id, label, required, optional, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="flex items-baseline gap-1.5">
        {label}
        {required && (
          <span aria-hidden="true" className="text-primary">
            *
          </span>
        )}
        {optional && <span className="text-xs font-normal text-muted-foreground">Optional</span>}
      </Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export const fieldDescribedBy = (id: string, hasError: boolean, hasHint: boolean) =>
  hasError ? `${id}-error` : hasHint ? `${id}-hint` : undefined;
