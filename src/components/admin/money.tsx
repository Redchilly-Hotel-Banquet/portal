import { cn } from "@/lib/utils";
import { formatINR } from "./format";

export function Money({ value, className }: { value: number | string | null | undefined; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatINR(value)}</span>;
}
