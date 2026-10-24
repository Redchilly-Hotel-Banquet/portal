import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "destructive" | "muted" | "primary";

const STATUS_TONES: Record<string, StatusTone> = {
  PENDING: "warning",
  ACCEPTED: "primary",
  CONFIRMED: "primary",
  PREPARING: "warning",
  IN_PROGRESS: "warning",
  READY: "success",
  DELIVERED: "success",
  COMPLETED: "success",
  ORDER_FINISHED: "success",
  CHECKED_IN: "success",
  AVAILABLE: "success",
  CHECKED_OUT: "muted",
  CANCELLED: "destructive",
  REJECTED: "destructive",
  UNAVAILABLE: "destructive",
};

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  primary: "border-primary/30 bg-primary/10 text-primary",
  muted: "border-border bg-muted text-muted-foreground",
};

const normalise = (status: string) => status.trim().toUpperCase().replace(/[\s-]+/g, "_");

export const statusLabel = (status: string): string => {
  const words = normalise(status).split("_").filter(Boolean);
  return words.map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
};

export function StatusBadge({ status, tone, className }: { status: string | null | undefined; tone?: StatusTone; className?: string }) {
  if (!status) return null;
  const resolved = tone ?? STATUS_TONES[normalise(status)] ?? "muted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[resolved],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {statusLabel(status)}
    </span>
  );
}
