"use client";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/admin/money";

interface CartBarProps {
  count: number;
  total: number;
  onReview: () => void;
}

/** Mobile bottom bar. Hidden from lg upwards where the side panel takes over. */
export function CartBar({ count, total, onReview }: CartBarProps) {
  if (count === 0) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="page-container flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            <span className="tabular-nums">{count}</span> {count === 1 ? "item" : "items"}
          </p>
          <Money value={total} className="font-display text-lg leading-tight" />
        </div>
        <Button type="button" onClick={onReview}>
          Review order
        </Button>
      </div>
    </div>
  );
}
