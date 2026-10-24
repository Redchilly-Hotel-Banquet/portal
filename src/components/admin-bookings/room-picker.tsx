"use client";

import { useMemo, useState } from "react";
import { formatINR } from "@/components/admin/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AvailableRoom } from "./types";
import { filterAvailableRooms } from "./utils";

type Props = {
  rooms: AvailableRoom[];
  selected: string[];
  onToggle: (roomId: string, checked: boolean) => void;
};

const ANY = "any";
const typeOf = (room: AvailableRoom) => room.room_type ?? room.type ?? "Room";

export function RoomPicker({ rooms, selected, onToggle }: Props) {
  const [term, setTerm] = useState("");
  const [roomType, setRoomType] = useState(ANY);
  const [capacity, setCapacity] = useState(ANY);

  // Filter choices come from the rooms actually offered for this booking window.
  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const room of rooms) counts.set(typeOf(room), (counts.get(typeOf(room)) ?? 0) + 1);
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rooms]);
  // Exact capacities as stored on the rooms, each with its room count.
  const capacities = useMemo(() => {
    const counts = new Map<number, number>();
    for (const room of rooms) {
      const n = Number(room.occupancy);
      if (Number.isFinite(n) && n > 0) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(([a], [b]) => a - b);
  }, [rooms]);

  const visible = useMemo(
    () =>
      filterAvailableRooms(rooms, term).filter(
        (room) =>
          (roomType === ANY || typeOf(room) === roomType) &&
          (capacity === ANY || Number(room.occupancy) === Number(capacity)),
      ),
    [rooms, term, roomType, capacity],
  );

  const filtering = Boolean(term) || roomType !== ANY || capacity !== ANY;
  const hiddenSelected = selected.filter((id) => !visible.some((room) => room.id === id)).length;
  const clearFilters = () => {
    setTerm("");
    setRoomType(ANY);
    setCapacity(ANY);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search room number"
          aria-label="Search rooms"
          className="w-full sm:w-64"
        />
        <Select value={roomType} onValueChange={setRoomType} disabled={types.length < 2}>
          <SelectTrigger aria-label="Filter by room type" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All room types</SelectItem>
            {types.map(([type, count]) => (
              <SelectItem key={type} value={type}>
                {type} ({count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={capacity} onValueChange={setCapacity} disabled={capacities.length < 2}>
          <SelectTrigger aria-label="Filter by room capacity" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any capacity</SelectItem>
            {capacities.map(([n, count]) => (
              <SelectItem key={n} value={String(n)}>
                Sleeps {n} ({count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtering ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : null}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {filtering ? `${visible.length} of ${rooms.length} rooms · ` : ""}
          {selected.length} selected
        </span>
      </div>

      {visible.length ? (
        <ul className="grid max-h-64 gap-2 overflow-y-auto rounded-md border bg-surface p-2 sm:grid-cols-2">
          {visible.map((room) => {
            const disabled = room.isOccupiedByAnother && !room.isAssignedToBooking;
            const inputId = `room-${room.id}`;
            return (
              <li key={room.id}>
                <label
                  htmlFor={inputId}
                  className={`flex items-start gap-3 rounded-sm border bg-card p-3 text-sm ${
                    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50"
                  }`}
                >
                  <Checkbox
                    id={inputId}
                    checked={selected.includes(room.id)}
                    disabled={disabled}
                    onCheckedChange={(checked) => onToggle(room.id, checked === true)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {room.code}
                      {room.isAssignedToBooking ? <Badge variant="outline">Current</Badge> : null}
                      {disabled ? <Badge variant="destructive">Occupied</Badge> : null}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {room.room_type ?? room.type ?? "Room"}
                      {room.occupancy ? `, sleeps ${room.occupancy}` : ""}
                      {room.price_per_night != null ? `, ${formatINR(room.price_per_night)} per night` : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {rooms.length ? "No rooms match these filters." : "No rooms are available for this booking window."}
        </p>
      )}
      {hiddenSelected > 0 ? (
        <p role="status" className="text-xs text-warning">
          {hiddenSelected} selected room{hiddenSelected === 1 ? " is" : "s are"} hidden by the current filters and will still be assigned.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Select every room allocated to this reservation. Occupied rooms cannot be assigned until they are freed.
      </p>
    </div>
  );
}
