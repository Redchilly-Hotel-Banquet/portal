import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-md border border-dashed border-border px-6 py-12 sm:items-center sm:text-center", className)}>
      {Icon ? <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} aria-hidden /> : null}
      <div className="space-y-1">
        <p className="font-display text-lg text-foreground">{title}</p>
        {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
