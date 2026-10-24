"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatINR } from "@/components/admin/format";
import type { PricingMode, PricingRulePayload, RoomRecord } from "./types";
import { todayInput } from "./utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outlets: string[];
  rooms: RoomRecord[];
  saving: boolean;
  onSubmit: (rule: PricingRulePayload) => void;
};

type Errors = Partial<Record<"outlet" | "value" | "start" | "end", string>>;

export function PricingRuleSheet({ open, onOpenChange, outlets, rooms, saving, onSubmit }: Props) {
  const [outlet, setOutlet] = useState("");
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [mode, setMode] = useState<PricingMode>("PERCENT");
  const [percent, setPercent] = useState("");
  const [fixed, setFixed] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    setOutlet((prev) => prev || outlets[0] || "");
    setRoomIds([]);
    setMode("PERCENT");
    setPercent("");
    setFixed("");
    setStart(todayInput());
    setEnd("");
    setNotes("");
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const outletRooms = useMemo(() => rooms.filter((r) => r.type === "ROOM" && r.outlet_id === outlet), [rooms, outlet]);

  const changeOutlet = (value: string) => {
    setOutlet(value);
    setRoomIds([]);
  };

  const toggleRoom = (id: string, checked: boolean) =>
    setRoomIds((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    const pct = Number(percent);
    const rate = Number(fixed);
    if (!outlet) next.outlet = "Choose a branch.";
    if (!start) next.start = "Choose when the rule begins.";
    if (end && start && end < start) next.end = "The end date cannot be before the start date.";
    if (mode === "PERCENT" && (!percent || !Number.isFinite(pct) || pct === 0)) next.value = "Enter a percentage other than zero.";
    if (mode === "FIXED" && (!fixed || !Number.isFinite(rate) || rate <= 0)) next.value = "Enter a nightly rate greater than zero.";
    setErrors(next);
    if (Object.keys(next).length) return;

    onSubmit({
      outlet_id: outlet,
      room_ids: roomIds,
      mode,
      percent_increase: mode === "PERCENT" ? pct : 0,
      fixed_rate: mode === "FIXED" ? rate : undefined,
      start_date: start,
      end_date: end || undefined,
      notes: notes.trim(),
    });
  };

  const example = (() => {
    const pct = Number(percent);
    if (mode !== "PERCENT" || !Number.isFinite(pct) || pct === 0) return null;
    return `A ${formatINR(5000)} room becomes ${formatINR(Math.round(5000 * (1 + pct / 100) * 100) / 100)} per night.`;
  })();

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <p className="eyebrow">Pricing</p>
          <SheetTitle>New pricing rule</SheetTitle>
          <SheetDescription>Adjust nightly rates for a date range. Dates are inclusive.</SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
          <div className="flex-1 space-y-5 px-6 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="rule-outlet">Branch</Label>
              <Select value={outlet} onValueChange={changeOutlet} disabled={saving}>
                <SelectTrigger id="rule-outlet" aria-invalid={!!errors.outlet}>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {outlets.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.outlet ? <p className="text-xs text-destructive">{errors.outlet}</p> : null}
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium leading-none">Applies to</legend>
              <p className="text-xs text-muted-foreground">
                {roomIds.length === 0 ? "All rooms in this branch." : `${roomIds.length} selected room${roomIds.length === 1 ? "" : "s"}.`} Select rooms to narrow the rule.
              </p>
              <ScrollArea className="h-36 rounded-md border border-border">
                <div className="space-y-1 p-2">
                  {outletRooms.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">No rooms in this branch.</p>
                  ) : (
                    outletRooms.map((room) => (
                      <label key={room.id} className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-muted/60">
                        <Checkbox checked={roomIds.includes(room.id)} onCheckedChange={(s) => toggleRoom(room.id, s === true)} />
                        <span className="font-medium tabular-nums">{room.code}</span>
                        {room.room_type ? <span className="text-muted-foreground">{room.room_type}</span> : null}
                      </label>
                    ))
                  )}
                </div>
              </ScrollArea>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rule-mode">Adjustment</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as PricingMode)} disabled={saving}>
                  <SelectTrigger id="rule-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">Percentage change</SelectItem>
                    <SelectItem value="FIXED">Fixed nightly rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-value">{mode === "PERCENT" ? "Change (%)" : "Rate (INR)"}</Label>
                {mode === "PERCENT" ? (
                  <Input id="rule-value" type="number" step="0.1" value={percent} onChange={(e) => setPercent(e.target.value)} className="tabular-nums" placeholder="20" aria-invalid={!!errors.value} disabled={saving} />
                ) : (
                  <Input id="rule-value" type="number" min="0" step="0.5" value={fixed} onChange={(e) => setFixed(e.target.value)} className="tabular-nums" placeholder="6500" aria-invalid={!!errors.value} disabled={saving} />
                )}
              </div>
            </div>
            {errors.value ? <p className="-mt-3 text-xs text-destructive">{errors.value}</p> : example ? <p className="-mt-3 text-xs text-muted-foreground">{example}</p> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rule-start">Starts</Label>
                <Input id="rule-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={!!errors.start} disabled={saving} />
                {errors.start ? <p className="text-xs text-destructive">{errors.start}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-end">Ends</Label>
                <Input id="rule-end" type="date" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} aria-invalid={!!errors.end} disabled={saving} />
                {errors.end ? <p className="text-xs text-destructive">{errors.end}</p> : <p className="text-xs text-muted-foreground">Leave empty for no end date.</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-notes">Notes</Label>
              <Textarea id="rule-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Diwali week, wedding season" disabled={saving} />
            </div>
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden /> : null}
              {saving ? "Saving" : "Add rule"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
