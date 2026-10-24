"use client";

import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/admin/money";
import { QtyStepper } from "../qty-stepper";
import type { CartItem } from "../types";

interface CartSummaryProps {
  items: CartItem[];
  count: number;
  total: number;
  prep: number;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onReview: () => void;
}

/** Desktop order panel shown beside the menu. */
export function CartSummary({ items, count, total, prep, onInc, onDec, onReview }: CartSummaryProps) {
  return (
    <aside aria-label="Your order" className="rounded-lg border border-border bg-card p-5">
      <p className="eyebrow">Your order</p>
      {items.length === 0 ? (
        <div className="mt-4 flex items-start gap-3 text-sm text-muted-foreground">
          <ShoppingBag strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>Nothing selected yet. Add dishes from the menu and they will appear here.</p>
        </div>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <Money value={item.price * item.quantity} className="text-xs text-muted-foreground" />
                </div>
                <QtyStepper name={item.name} quantity={item.quantity} onInc={() => onInc(item.id)} onDec={() => onDec(item.id)} />
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">
                Total <span className="tabular-nums">({count} {count === 1 ? "item" : "items"})</span>
              </span>
              <Money value={total} className="font-display text-xl" />
            </div>
            {prep > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Estimated preparation: <span className="tabular-nums">{prep}</span> min
              </p>
            )}
            <Button type="button" className="mt-4 w-full" onClick={onReview}>
              Review order
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}
