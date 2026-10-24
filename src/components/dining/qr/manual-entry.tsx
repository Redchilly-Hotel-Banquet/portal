"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import type { OutletInfo } from "../types";
import type { LocationKind, LocationRequest } from "./location-session";

interface ManualEntryProps {
  initial?: { code?: string | null; type?: LocationKind; outletId?: string | null };
  busy: boolean;
  onSubmit: (request: LocationRequest) => void;
}

const TYPES: { value: LocationKind; label: string }[] = [
  { value: "ROOM", label: "Room" },
  { value: "TABLE", label: "Table" },
];

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm";

export function ManualEntry({ initial, busy, onSubmit }: ManualEntryProps) {
  const [type, setType] = useState<LocationKind>(initial?.type ?? "ROOM");
  const [code, setCode] = useState(initial?.code ?? "");
  const [outletId, setOutletId] = useState(initial?.outletId ?? "");

  const outlets = useQuery<{ outlets: OutletInfo[] }>({
    queryKey: ["public-outlets"],
    queryFn: () => apiGet<{ outlets: OutletInfo[] }>("/public/outlets"),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const list = outlets.data?.outlets ?? [];

  // Pick the only branch automatically.
  useEffect(() => {
    if (!outletId && list.length === 1) setOutletId(list[0].location_key || list[0].id);
  }, [list, outletId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || !outletId.trim()) return;
    onSubmit({ code: code.trim(), type, outletId: outletId.trim() });
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">I am at a</legend>
        <div className="inline-flex rounded-md border border-input p-0.5">
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={cn(
                "cursor-pointer rounded-[5px] px-4 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                type === t.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input type="radio" name="kind" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="sr-only" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="outlet">Branch</Label>
        {list.length > 0 ? (
          <select id="outlet" className={selectClass} value={outletId} onChange={(e) => setOutletId(e.target.value)} required>
            <option value="" disabled>
              Select a branch
            </option>
            {list.map((o) => (
              <option key={o.id} value={o.location_key || o.id}>
                {o.name || o.location_key}
              </option>
            ))}
          </select>
        ) : (
          <Input
            id="outlet"
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            placeholder="Branch code, as printed on the QR card"
            autoComplete="off"
            required
          />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="code">{type === "ROOM" ? "Room number" : "Table number"}</Label>
        <Input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={type === "ROOM" ? "For example 101" : "For example A1"}
          autoComplete="off"
          autoCapitalize="characters"
          required
        />
      </div>

      <Button type="submit" disabled={busy || !code.trim() || !outletId.trim()} className="w-full sm:w-auto">
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        Continue to menu
      </Button>
    </form>
  );
}
