import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  /** Short change note, e.g. "+12% vs last week". Direction only tints text. */
  trend?: { label: string; direction?: "up" | "down" | "flat" };
  icon?: LucideIcon;
  className?: string;
};

export function StatCard({ label, value, hint, trend, icon: Icon, className }: StatCardProps) {
  return (
    <div className={cn("rounded-md border border-border bg-card p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{label}</p>
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden /> : null}
      </div>
      <p className="mt-3 font-display text-3xl leading-none tabular-nums text-foreground">{value}</p>
      {(trend || hint) && (
        <p className="mt-3 text-xs text-muted-foreground">
          {trend ? (
            <span
              className={cn(
                "mr-2 font-medium tabular-nums",
                trend.direction === "up" && "text-success",
                trend.direction === "down" && "text-destructive",
              )}
            >
              {trend.label}
            </span>
          ) : null}
          {hint}
        </p>
      )}
    </div>
  );
}
