"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { formatDate, formatINR } from "@/components/admin/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAdminScopes } from "@/hooks/useAdminAccess";
import type { Booking } from "./types";
import { useSplitStayLines, useUpdateStayRate } from "./use-bookings";

/** The room for each range of nights, with the rate and amount. Administrators can change a line's nightly rate. */
export function RoomLines({ booking }: { booking: Booking }) {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => setIsAdmin(getAdminScopes().includes("admin")), []);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const update = useUpdateStayRate(() => setEditing(null));
  const split = useSplitStayLines();
  const lines = booking.stay_segments ?? [];
  const open = booking.status !== "CHECKED_OUT" && booking.status !== "CANCELLED";

  if (lines.length === 0) {
    return isAdmin && open && booking.status === "CHECKED_IN" ? (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3 text-sm">
        <span className="text-muted-foreground">One room total covers this stay. Split it to set a rate per room, for example a discount.</span>
        <Button size="sm" variant="outline" onClick={() => split.mutate({ id: booking.id })} disabled={split.isPending}>
          {split.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          Set rate per room
        </Button>
      </div>
    ) : null;
  }

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const save = (index: number) => {
    const rate = Number(draft);
    if (!draft.trim() || !Number.isFinite(rate) || rate < 0) return;
    update.mutate({ id: booking.id, segmentIndex: index, rate });
  };

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-md border bg-card text-sm">
        {lines.map((line, index) => (
          <li key={`${line.room_id}-${index}`} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <span className="min-w-0">
              <span className="font-medium">Room {line.code || line.room_id}</span>
              <span className="text-muted-foreground">{line.type ? ` · ${line.type}` : ""}</span>
              {line.kind === "EXTENSION" ? <span className="ml-2 rounded-sm border px-1.5 py-0.5 text-[11px] text-muted-foreground">Extension</span> : null}
              <span className="block text-xs text-muted-foreground tabular-nums">
                {formatDate(line.from)} to {formatDate(line.to)}, {line.nights} night{line.nights === 1 ? "" : "s"}
              </span>
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              {editing === index ? (
                <>
                  <Input
                    aria-label={`Rate per night for room ${line.code}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="h-9 w-28"
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") save(index);
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => save(index)} disabled={update.isPending} aria-label="Save rate">
                    {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(null)} aria-label="Cancel">
                    <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">{formatINR(line.rate)} x {line.nights}</span>
                  <span className="w-24 text-right font-medium">{formatINR(line.amount)}</span>
                  {isAdmin && open ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label={`Change rate for room ${line.code}`}
                      onClick={() => {
                        setDraft(String(line.rate));
                        setEditing(index);
                      }}
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </Button>
                  ) : null}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between px-1 text-sm font-medium">
        <span>Room total (before GST)</span>
        <span className="tabular-nums">{formatINR(total)}</span>
      </p>
    </div>
  );
}
