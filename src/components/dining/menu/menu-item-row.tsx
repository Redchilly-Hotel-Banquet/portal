"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/admin/money";
import { DietMark } from "../diet-mark";
import { QtyStepper } from "../qty-stepper";
import type { MenuItem } from "../types";
import { toNumber } from "../utils";

interface MenuItemRowProps {
  item: MenuItem;
  quantity: number;
  canOrder: boolean;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
}

function Thumbnail({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className="h-20 w-20 shrink-0 rounded-md border border-border object-cover sm:h-24 sm:w-24"
    />
  );
}

export function MenuItemRow({ item, quantity, canOrder, onAdd, onInc, onDec }: MenuItemRowProps) {
  const name = item.name ?? "Untitled dish";
  const unavailable = item.is_available === false;
  const prep = toNumber(item.prep_time_minutes, 0);

  return (
    <li className="flex gap-4 border-b border-border py-5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <h3 className="flex min-w-0 items-center gap-2 text-lg leading-snug">
            {typeof item.is_veg === "boolean" && <DietMark veg={item.is_veg} />}
            <span className="min-w-0 break-words">{name}</span>
          </h3>
          <span aria-hidden className="mb-1 hidden min-w-6 flex-1 self-end border-b border-dotted border-border sm:block" />
          <Money value={toNumber(item.price)} className="ml-auto shrink-0 text-base font-medium sm:ml-0" />
        </div>

        {item.description && <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">{item.description}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {prep > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden />
              <span className="tabular-nums">{prep}</span> min
            </span>
          )}
          {unavailable && <span className="text-xs font-medium text-destructive">Currently unavailable</span>}
          {canOrder && !unavailable && (
            <span className="ml-auto sm:ml-0">
              {quantity > 0 ? (
                <QtyStepper name={name} quantity={quantity} onInc={onInc} onDec={onDec} />
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={onAdd} aria-label={`Add ${name} to order`}>
                  Add
                </Button>
              )}
            </span>
          )}
        </div>
      </div>
      {item.image_url && <Thumbnail src={item.image_url} alt={name} />}
    </li>
  );
}
