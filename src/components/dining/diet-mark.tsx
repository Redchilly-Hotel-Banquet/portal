import { cn } from "@/lib/utils";

interface DietMarkProps {
  veg: boolean;
  className?: string;
}

/** Square-with-dot dietary symbol (Indian packaging convention) plus a screen-reader label. */
export function DietMark({ veg, className }: DietMarkProps) {
  const label = veg ? "Vegetarian" : "Non-vegetarian";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px]",
        veg ? "border-success" : "border-destructive",
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", veg ? "bg-success" : "bg-destructive")} aria-hidden />
    </span>
  );
}
