"use client";

import { BellRing, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { shortId } from "./types";

type AlarmDialogProps = {
  open: boolean;
  orderIds: string[];
  audioEnabled: boolean;
  onEnableSound: () => void;
  onAcknowledge: () => void;
};

/** Modal that cannot be dismissed except by acknowledging, so a new order is never missed. */
export function AlarmDialog({ open, orderIds, audioEnabled, onEnableSound, onAcknowledge }: AlarmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <p className="eyebrow flex items-center gap-2 text-primary">
            <BellRing className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Attention
          </p>
          <DialogTitle className="font-display text-2xl">
            {orderIds.length === 1 ? "New order received" : `${orderIds.length} new orders received`}
          </DialogTitle>
          <DialogDescription>The alert keeps sounding until you acknowledge it.</DialogDescription>
        </DialogHeader>

        <ul className="max-h-48 divide-y divide-border overflow-auto rounded-md border border-border text-sm">
          {orderIds.map((id) => (
            <li key={id} className="px-3 py-2 tabular-nums">
              Order #{shortId(id)}
            </li>
          ))}
        </ul>

        {!audioEnabled ? (
          <p className="text-sm text-muted-foreground">Sound is off on this device. Enable it to hear the alert.</p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
          {!audioEnabled ? (
            <Button variant="outline" onClick={onEnableSound}>
              <Volume2 aria-hidden strokeWidth={1.75} /> Enable sound
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={onAcknowledge} autoFocus>
            Acknowledge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
