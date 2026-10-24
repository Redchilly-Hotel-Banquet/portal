"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { RoomKind, RoomPayload, RoomRecord } from "./types";

type FormState = {
  code: string;
  type: RoomKind;
  outlet_id: string;
  level: string;
  room_type: string;
  occupancy: string;
  price: string;
  amenities: string;
  is_active: boolean;
};

type Errors = Partial<Record<"code" | "outlet_id" | "price" | "occupancy", string>>;

const blank = (outlet: string): FormState => ({
  code: "",
  type: "ROOM",
  outlet_id: outlet,
  level: "",
  room_type: "",
  occupancy: "2",
  price: "",
  amenities: "",
  is_active: true,
});

const fromRoom = (r: RoomRecord): FormState => ({
  code: r.code,
  type: r.type,
  outlet_id: r.outlet_id,
  level: r.level,
  room_type: r.room_type,
  occupancy: r.occupancy !== null ? String(r.occupancy) : "2",
  price: r.price_per_night ? String(r.price_per_night) : "",
  amenities: r.amenities.join(", "),
  is_active: r.is_active,
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: RoomRecord | null;
  outlets: string[];
  outletsLoading: boolean;
  categories: string[];
  saving: boolean;
  onSubmit: (data: RoomPayload, id?: string) => void;
};

export function RoomFormSheet({ open, onOpenChange, room, outlets, outletsLoading, categories, saving, onSubmit }: Props) {
  const [form, setForm] = useState<FormState>(() => blank(""));
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(room ? fromRoom(room) : blank(outlets.length === 1 ? outlets[0] : ""));
    // Only reset when the sheet opens or the edited record changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, room]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // An error describes the value that was just changed, so it goes as soon as the user edits it.
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key as keyof Errors];
      // Tables have no rate or guest limit, so their errors must not linger after switching type.
      if (key === "type") {
        delete next.price;
        delete next.occupancy;
      }
      return next;
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    const price = Number(form.price);
    const occupancy = Number(form.occupancy);
    if (!form.code.trim()) next.code = "Enter a room number or table code.";
    if (!form.outlet_id) next.outlet_id = "Choose the branch this belongs to.";
    if (form.type === "ROOM" && (!Number.isFinite(price) || price <= 0)) next.price = "Enter a base rate greater than zero.";
    if (form.type === "ROOM" && (!Number.isInteger(occupancy) || occupancy < 1)) next.occupancy = "Enter a whole number of guests, 1 or more.";
    setErrors(next);
    if (Object.keys(next).length) return;

    onSubmit(
      {
        code: form.code.trim(),
        type: form.type,
        outlet_id: form.outlet_id,
        level: form.level.trim(),
        room_type: form.type === "ROOM" ? form.room_type.trim() || undefined : undefined,
        occupancy: form.type === "ROOM" ? occupancy : undefined,
        // A table is not sold by the night, so it has no rate.
        price_per_night: form.type === "ROOM" ? price : 0,
        amenities: form.type === "ROOM" ? form.amenities.split(",").map((a) => a.trim()).filter(Boolean) : [],
        is_active: form.is_active,
      },
      room?.id,
    );
  };

  const isRoom = form.type === "ROOM";
  const fieldError = (id: string, msg?: string) =>
    msg ? (
      <p id={`${id}-error`} className="text-xs text-destructive">
        {msg}
      </p>
    ) : null;

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <p className="eyebrow">{room ? "Edit" : "New"}</p>
          <SheetTitle>{room ? `${room.type === "TABLE" ? "Table" : "Room"} ${room.code}` : "Add to inventory"}</SheetTitle>
          <SheetDescription>{isRoom ? "Rooms are bookable by guests." : "Tables are used for in-restaurant ordering and have no rate."}</SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
          <div className="flex-1 space-y-5 px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="room-code">{isRoom ? "Room number" : "Table code"}</Label>
                <Input
                  id="room-code"
                  value={form.code}
                  onChange={(e) => set("code", e.target.value)}
                  placeholder="101"
                  aria-invalid={!!errors.code}
                  aria-describedby={errors.code ? "room-code-error" : undefined}
                  disabled={saving}
                />
                {fieldError("room-code", errors.code)}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="room-type">Type</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v as RoomKind)} disabled={saving}>
                  <SelectTrigger id="room-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ROOM">Room</SelectItem>
                    <SelectItem value="TABLE">Table</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="room-outlet">Branch</Label>
              <Select value={form.outlet_id} onValueChange={(v) => set("outlet_id", v)} disabled={saving || outletsLoading || outlets.length === 0}>
                <SelectTrigger id="room-outlet" aria-invalid={!!errors.outlet_id} aria-describedby={errors.outlet_id ? "room-outlet-error" : undefined}>
                  <SelectValue placeholder={outletsLoading ? "Loading branches" : outlets.length ? "Select branch" : "No branches available"} />
                </SelectTrigger>
                <SelectContent>
                  {outlets.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("room-outlet", errors.outlet_id)}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {isRoom ? (
                <div className="space-y-1.5">
                  <Label htmlFor="room-category">Category</Label>
                  <Input
                    id="room-category"
                    list="room-category-options"
                    value={form.room_type}
                    onChange={(e) => set("room_type", e.target.value)}
                    placeholder="Deluxe, Suite"
                    disabled={saving}
                  />
                  <datalist id="room-category-options">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              ) : null}
              <div className={isRoom ? "space-y-1.5" : "space-y-1.5 sm:col-span-2"}>
                <Label htmlFor="room-level">Floor</Label>
                <Input id="room-level" value={form.level} onChange={(e) => set("level", e.target.value)} placeholder="Ground, 1, 2" disabled={saving} />
              </div>
            </div>

            {isRoom ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="room-price">Base rate per night (INR)</Label>
                    <Input
                      id="room-price"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => set("price", e.target.value)}
                      className="tabular-nums"
                      aria-invalid={!!errors.price}
                      aria-describedby={errors.price ? "room-price-error" : undefined}
                      disabled={saving}
                    />
                    {fieldError("room-price", errors.price)}
                  </div>
                  <div className="space-y-1.5">
                      <Label htmlFor="room-occupancy">Maximum guests</Label>
                      <Input
                        id="room-occupancy"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={form.occupancy}
                        onChange={(e) => set("occupancy", e.target.value)}
                        className="tabular-nums"
                        aria-invalid={!!errors.occupancy}
                        aria-describedby={errors.occupancy ? "room-occupancy-error" : undefined}
                        disabled={saving}
                      />
                      {fieldError("room-occupancy", errors.occupancy)}
                    </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="room-amenities">Amenities</Label>
                  <Textarea
                    id="room-amenities"
                    rows={3}
                    value={form.amenities}
                    onChange={(e) => set("amenities", e.target.value)}
                    placeholder="Wi-Fi, Breakfast, Air conditioning"
                    disabled={saving}
                  />
                  <p className="text-xs text-muted-foreground">Separate with commas. Guests see these while choosing a room category.</p>
                </div>
              </>
            ) : null}

            <div className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
              <div>
                <Label htmlFor="room-active" className="text-sm">
                  Available for use
                </Label>
                <p className="text-xs text-muted-foreground">Inactive entries are hidden from guests.</p>
              </div>
              <Switch id="room-active" checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} disabled={saving} />
            </div>
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden /> : null}
              {saving ? "Saving" : room ? "Save changes" : "Add"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
