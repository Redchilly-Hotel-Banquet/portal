"use client";

import { useEffect, useMemo, useState } from "react";
import { BedDouble, ChevronLeft, ChevronRight, Download, Loader2, Pencil, Printer, QrCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataToolbar } from "@/components/admin/data-toolbar";
import { EmptyState } from "@/components/admin/empty-state";
import { Money } from "@/components/admin/money";
import { StatusBadge } from "@/components/admin/status-badge";
import { downloadQrZip, printQrSheet, type QrCardInput } from "./qr";
import type { OutletRef, RoomRecord } from "./types";
import { buildQrUrl, errorMessage, qrFileName, qrLabel, resolveOutletKey } from "./utils";

const PAGE_SIZE = 20;
const ALL = "all";

type Props = {
  rooms: RoomRecord[];
  outletRefs: OutletRef[];
  outletKeys: string[];
  loading: boolean;
  error: string | null;
  onAdd: () => void;
  /** Administrators edit and delete; everyone else only switches rooms on and off. */
  canEdit: boolean;
  onToggleActive: (room: RoomRecord, active: boolean) => void;
  onEdit: (room: RoomRecord) => void;
  onDelete: (room: RoomRecord) => void;
  onShowQr: (room: RoomRecord) => void;
};

export function RoomsInventory({ rooms, outletRefs, outletKeys, loading, error, onAdd, canEdit, onToggleActive, onEdit, onDelete, onShowQr }: Props) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState(ALL);
  const [outlet, setOutlet] = useState(ALL);
  const [floor, setFloor] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<null | { kind: "zip" | "print"; done: number; total: number }>(null);

  const floors = useMemo(() => Array.from(new Set(rooms.map((r) => r.level).filter(Boolean))).sort((a, b) => a.localeCompare(b, "en", { numeric: true })), [rooms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms
      .filter((r) => (type === ALL ? true : r.type === type))
      .filter((r) => (outlet === ALL ? true : resolveOutletKey(r, outletRefs) === outlet))
      .filter((r) => (floor === ALL ? true : r.level === floor))
      .filter((r) => (status === ALL ? true : status === "active" ? r.is_active : !r.is_active))
      .filter((r) => !q || [r.code, r.room_type, r.level, resolveOutletKey(r, outletRefs)].join(" ").toLowerCase().includes(q))
      .sort((a, b) => a.outlet_id.localeCompare(b.outlet_id) || a.type.localeCompare(b.type) || a.code.localeCompare(b.code, "en", { numeric: true }));
  }, [rooms, outletRefs, search, type, outlet, floor, status]);

  useEffect(() => setPage(1), [search, type, outlet, floor, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);
  const filtering = search || type !== ALL || outlet !== ALL || floor !== ALL || status !== ALL;

  const toItems = (): QrCardInput[] =>
    filtered.map((room) => {
      const key = resolveOutletKey(room, outletRefs);
      return { url: buildQrUrl(window.location.origin, room, key), label: qrLabel(room, key), fileName: qrFileName(room, key) };
    });

  const runBulk = async (kind: "zip" | "print") => {
    if (filtered.length === 0) return toast.error("No entries match the current filters.");
    const items = toItems();
    setBusy({ kind, done: 0, total: items.length });
    const progress = (done: number, total: number) => setBusy({ kind, done, total });
    try {
      if (kind === "zip") {
        await downloadQrZip(items, progress);
        toast.success(`Downloaded ${items.length} QR code${items.length === 1 ? "" : "s"}.`);
      } else if (!(await printQrSheet(items, progress))) {
        toast.error("The print window was blocked. Allow pop-ups for this site and try again.");
      }
    } catch (err) {
      toast.error(errorMessage(err, "Could not prepare the QR codes."));
    } finally {
      setBusy(null);
    }
  };

  const filters = (
    <>
      <Select value={type} onValueChange={setType}>
        <SelectTrigger className="w-[8.5rem]" aria-label="Filter by type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          <SelectItem value="ROOM">Rooms</SelectItem>
          <SelectItem value="TABLE">Tables</SelectItem>
        </SelectContent>
      </Select>
      <Select value={outlet} onValueChange={setOutlet}>
        <SelectTrigger className="w-[10rem]" aria-label="Filter by branch">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All branches</SelectItem>
          {outletKeys.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {floors.length > 0 ? (
        <Select value={floor} onValueChange={setFloor}>
          <SelectTrigger className="w-[8.5rem]" aria-label="Filter by floor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All floors</SelectItem>
            {floors.map((f) => (
              <SelectItem key={f} value={f}>
                Floor {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-[8.5rem]" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  const actions = (
    <>
      <Button variant="outline" onClick={() => runBulk("print")} disabled={!!busy || filtered.length === 0}>
        {busy?.kind === "print" ? <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden /> : <Printer strokeWidth={1.75} aria-hidden />}
        {busy?.kind === "print" ? `Preparing ${busy.done}/${busy.total}` : "Print QR sheet"}
      </Button>
      <Button variant="outline" onClick={() => runBulk("zip")} disabled={!!busy || filtered.length === 0}>
        {busy?.kind === "zip" ? <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden /> : <Download strokeWidth={1.75} aria-hidden />}
        {busy?.kind === "zip" ? `Preparing ${busy.done}/${busy.total}` : "Download QR zip"}
      </Button>
    </>
  );

  return (
    <section aria-label="Inventory" className="space-y-4">
      <DataToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search number, category or floor" filters={filters} actions={actions} />

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title={filtering ? "Nothing matches these filters" : "No rooms or tables yet"}
          description={filtering ? "Clear a filter or change the search to see more." : "Add your first room or table to generate its guest QR code."}
          action={!filtering && canEdit ? <Button onClick={onAdd}>Add room or table</Button> : undefined}
        />
      ) : (
        <>
          <div className="max-h-[70vh] overflow-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Number</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Branch</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Floor</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Category</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Guests</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Base rate</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((room) => {
                  const label = `${room.type === "TABLE" ? "table" : "room"} ${room.code}`;
                  return (
                    <tr key={room.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium tabular-nums">{room.code}</span>
                          <Badge variant="outline" className="font-normal">
                            {room.type === "TABLE" ? "Table" : "Room"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3">{resolveOutletKey(room, outletRefs) || "-"}</td>
                      <td className="px-4 py-3 tabular-nums">{room.level || "-"}</td>
                      <td className="px-4 py-3">
                        <div>{room.room_type || "-"}</div>
                        {room.amenities.length > 0 ? <div className="max-w-[16rem] truncate text-xs text-muted-foreground">{room.amenities.join(", ")}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{room.type === "ROOM" ? room.occupancy ?? 2 : "-"}</td>
                      <td className="px-4 py-3 text-right">
                        {room.type === "ROOM" ? <Money value={room.price_per_night} /> : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Switch checked={Boolean(room.is_active)} onCheckedChange={(value) => onToggleActive(room, value)} aria-label={`${label} active`} />
                          <StatusBadge status={room.is_active ? "Active" : "Inactive"} tone={room.is_active ? "success" : "muted"} />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex justify-end">
                          <Button variant="ghost" size="icon" onClick={() => onShowQr(room)} aria-label={`QR code for ${label}`}>
                            <QrCode strokeWidth={1.75} aria-hidden />
                          </Button>
                          {canEdit ? (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => onEdit(room)} aria-label={`Edit ${label}`}>
                                <Pencil strokeWidth={1.75} aria-hidden />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => onDelete(room)} aria-label={`Delete ${label}`}>
                                <Trash2 className="text-destructive" strokeWidth={1.75} aria-hidden />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p className="tabular-nums">
              Showing {start + 1} to {start + rows.length} of {filtered.length}
              {filtered.length !== rooms.length ? ` (${rooms.length} in total)` : ""}
            </p>
            {pages > 1 ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(current - 1)} disabled={current === 1}>
                  <ChevronLeft strokeWidth={1.75} aria-hidden />
                  Previous
                </Button>
                <span className="tabular-nums">
                  Page {current} of {pages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setPage(current + 1)} disabled={current === pages}>
                  Next
                  <ChevronRight strokeWidth={1.75} aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
