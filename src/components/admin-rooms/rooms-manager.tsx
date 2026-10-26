"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost } from "@/lib/apiClient";
import { getAdminScopes } from "@/hooks/useAdminAccess";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { StatCard } from "@/components/admin/stat-card";
import { formatNumber } from "@/components/admin/format";
import { PricingPanel } from "./pricing-panel";
import { QrDialog } from "./qr-dialog";
import { RoomFormSheet } from "./room-form-sheet";
import { RoomsInventory } from "./rooms-inventory";
import type { RoomRecord } from "./types";
import { ROOMS_KEY, useOutlets, useRoomMutations, useRooms } from "./use-rooms-api";
import { resolveOutletKey } from "./utils";

export function RoomsManager() {
  const { data: rooms = [], isLoading, isError, error } = useRooms();
  const outlets = useOutlets(rooms);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RoomRecord | null>(null);
  const [deleting, setDeleting] = useState<RoomRecord | null>(null);
  const [qrRoom, setQrRoom] = useState<RoomRecord | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);

  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => setCanEdit(getAdminScopes().includes("admin")), []);
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiPost("/admin/rooms/manage", { action: "update", id, data: { is_active: active } }, true),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ROOMS_KEY }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update availability."),
  });

  const { save, remove } = useRoomMutations(() => {
    setFormOpen(false);
    setEditing(null);
  });

  const stats = useMemo(() => {
    const roomCount = rooms.filter((r) => r.type === "ROOM").length;
    return {
      rooms: roomCount,
      tables: rooms.length - roomCount,
      active: rooms.filter((r) => r.is_active).length,
      inactive: rooms.filter((r) => !r.is_active).length,
    };
  }, [rooms]);

  const categories = useMemo(() => Array.from(new Set(rooms.map((r) => r.room_type).filter(Boolean))).sort(), [rooms]);

  const openForm = (room: RoomRecord | null) => {
    setEditing(room);
    setFormOpen(true);
  };

  return (
    <AdminShell
      scope={["admin", "rooms"]}
      title="Rooms and tables"
      description={canEdit ? "Inventory, guest QR codes and seasonal rates" : "Switch rooms and tables on or off for your branch. Only an administrator can edit them or change rates."}
      actions={
        canEdit ? (
          <Button onClick={() => openForm(null)}>
            <Plus strokeWidth={1.75} aria-hidden />
            Add room or table
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Rooms" value={formatNumber(stats.rooms)} />
          <StatCard label="Tables" value={formatNumber(stats.tables)} />
          <StatCard label="Active" value={formatNumber(stats.active)} />
          <StatCard label="Inactive" value={formatNumber(stats.inactive)} />
        </div>

        <Tabs defaultValue="inventory" className="space-y-5">
          <TabsList>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            {canEdit ? <TabsTrigger value="pricing">Pricing rules</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="inventory" className="mt-0">
            <RoomsInventory
              rooms={rooms}
              outletRefs={outlets.refs}
              outletKeys={outlets.keys}
              loading={isLoading}
              error={isError ? error.message || "Inventory could not be loaded." : null}
              onAdd={() => openForm(null)}
              canEdit={canEdit}
              onToggleActive={(room, active) => toggle.mutate({ id: room.id, active })}
              onEdit={openForm}
              onDelete={setDeleting}
              onShowQr={setQrRoom}
            />
          </TabsContent>
          {canEdit ? (
            <TabsContent value="pricing" className="mt-0">
              <PricingPanel rooms={rooms} outlets={outlets.keys} creating={pricingOpen} onCreatingChange={setPricingOpen} />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>

      <RoomFormSheet
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        room={editing}
        outlets={outlets.keys}
        outletsLoading={outlets.isLoading}
        categories={categories}
        saving={save.isPending}
        onSubmit={(data, id) => save.mutate({ id, data })}
      />

      <QrDialog room={qrRoom} outletKey={qrRoom ? resolveOutletKey(qrRoom, outlets.refs) : ""} onClose={() => setQrRoom(null)} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete ${deleting.type === "TABLE" ? "table" : "room"} ${deleting.code}?` : "Delete?"}
        description="Its printed QR code will stop working. This cannot be undone. Mark it inactive instead if you only need to hide it."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
          } catch {
            // surfaced by the mutation's toast
          }
          setDeleting(null);
        }}
      />
    </AdminShell>
  );
}
