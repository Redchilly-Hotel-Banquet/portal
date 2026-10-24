"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataToolbar } from "@/components/admin/data-toolbar";
import { EmptyState } from "@/components/admin/empty-state";
import { Money } from "@/components/admin/money";
import { formatDate, formatNumber } from "@/components/admin/format";
import { ApiError, apiPost } from "@/lib/apiClient";
import { MenuItemSheet } from "./menu-item-sheet";
import { useOutletKeys } from "./use-outlets";
import {
  itemId,
  type CategoryRecord,
  type MenuItemListResponse,
  type MenuItemPayload,
  type MenuItemRecord,
} from "./types";

type Sort = "newest" | "name" | "priceAsc" | "priceDesc";
const ALL = "all";

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function MenuItemsManager() {
  const queryClient = useQueryClient();
  const { keys: outlets, isLoading: outletsLoading } = useOutletKeys();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItemRecord | null>(null);
  const [deleting, setDeleting] = useState<MenuItemRecord | null>(null);
  const [search, setSearch] = useState("");
  const [outletFilter, setOutletFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [vegFilter, setVegFilter] = useState(ALL);
  const [availFilter, setAvailFilter] = useState(ALL);
  const [sortBy, setSortBy] = useState<Sort>("newest");

  const itemsQuery = useQuery({
    queryKey: ["admin-menu-items"],
    queryFn: () => apiPost<MenuItemListResponse>("/admin/menu-items/manage", { action: "list" }, true),
  });
  const categoriesQuery = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => apiPost<CategoryRecord[]>("/admin/categories/manage", { action: "list" }, true),
  });

  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);
  const categoryNames = useMemo(
    () => Array.from(new Set((categoriesQuery.data ?? []).map((c) => c.name).filter(Boolean))),
    [categoriesQuery.data],
  );

  // A single outlet is selected by default, as before.
  const onlyOutlet = outlets.length === 1 ? outlets[0] : "";
  useEffect(() => {
    if (onlyOutlet) setOutletFilter((prev) => (prev === ALL ? onlyOutlet : prev));
  }, [onlyOutlet]);

  const save = useMutation({
    mutationFn: (vars: { action: "create" | "update" | "delete"; id?: string; data?: Partial<MenuItemPayload> }) =>
      apiPost("/admin/menu-items/manage", vars, true),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-menu-items"] });
      if (vars.action !== "update" || vars.data?.name !== undefined) {
        setSheetOpen(false);
        setEditing(null);
      }
      setDeleting(null);
      toast.success(
        vars.action === "delete" ? "Menu item deleted" : vars.action === "create" ? "Menu item created" : "Menu item updated",
      );
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not save the menu item")),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const res = items.filter((i) => {
      if (outletFilter !== ALL && (i.outlet_id ?? "").toLowerCase() !== outletFilter.toLowerCase()) return false;
      if (categoryFilter !== ALL && (i.category ?? i.category_id) !== categoryFilter) return false;
      if (vegFilter !== ALL && Boolean(i.is_veg) !== (vegFilter === "veg")) return false;
      if (availFilter !== ALL && Boolean(i.is_available) !== (availFilter === "available")) return false;
      if (!q) return true;
      return [i.name, i.description, i.category, i.category_id].some((v) => String(v ?? "").toLowerCase().includes(q));
    });
    const stamp = (i: MenuItemRecord) => new Date(i.updated_at ?? i.created_at ?? 0).getTime();
    return res.sort((a, b) => {
      switch (sortBy) {
        case "priceAsc": return (a.price ?? 0) - (b.price ?? 0);
        case "priceDesc": return (b.price ?? 0) - (a.price ?? 0);
        case "name": return String(a.name ?? "").localeCompare(String(b.name ?? ""));
        default: return stamp(b) - stamp(a);
      }
    });
  }, [items, outletFilter, categoryFilter, vegFilter, availFilter, search, sortBy]);

  const openNew = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (item: MenuItemRecord) => {
    setEditing(item);
    setSheetOpen(true);
  };

  const submit = (payload: MenuItemPayload) =>
    editing ? save.mutate({ action: "update", id: itemId(editing), data: payload }) : save.mutate({ action: "create", data: payload });

  const toggleAvailability = (item: MenuItemRecord, value: boolean) =>
    save.mutate({ action: "update", id: itemId(item), data: { is_available: value } });

  const availableCount = rows.filter((i) => i.is_available).length;

  return (
    <AdminShell
      scope={["admin", "kitchen"]}
      title="Menu items"
      description="Dishes, pricing and availability by outlet."
      actions={<Button size="sm" onClick={openNew}><Plus aria-hidden strokeWidth={1.75} /> Add item</Button>}
    >
      <div className="space-y-4">
        <DataToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search name, description or category"
          filters={
            <>
              <Select value={outletFilter} onValueChange={setOutletFilter}>
                <SelectTrigger className="w-36" aria-label="Outlet"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All outlets</SelectItem>
                  {outlets.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40" aria-label="Category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {categoryNames.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={vegFilter} onValueChange={setVegFilter}>
                <SelectTrigger className="w-32" aria-label="Diet"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All diets</SelectItem>
                  <SelectItem value="veg">Vegetarian</SelectItem>
                  <SelectItem value="nonveg">Non-vegetarian</SelectItem>
                </SelectContent>
              </Select>
              <Select value={availFilter} onValueChange={setAvailFilter}>
                <SelectTrigger className="w-36" aria-label="Availability"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any availability</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as Sort)}>
                <SelectTrigger className="w-40" aria-label="Sort"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Recently updated</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="priceAsc">Price, low to high</SelectItem>
                  <SelectItem value="priceDesc">Price, high to low</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />

        {itemsQuery.isError ? (
          <EmptyState
            icon={UtensilsCrossed}
            title="Menu items could not be loaded"
            description={itemsQuery.error instanceof ApiError ? itemsQuery.error.message : "Check your connection and try again."}
            action={<Button variant="outline" onClick={() => void itemsQuery.refetch()}>Retry</Button>}
          />
        ) : itemsQuery.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title={items.length === 0 ? "No menu items yet" : "No items match these filters"}
            description={items.length === 0 ? "Add the first dish to start taking orders." : "Clear a filter or search term to see more."}
            action={items.length === 0 ? <Button onClick={openNew}><Plus aria-hidden strokeWidth={1.75} /> Add item</Button> : undefined}
          />
        ) : (
          <>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatNumber(rows.length)} items, {formatNumber(availableCount)} available
            </p>
            <div className="max-h-[70vh] overflow-auto rounded-md border border-border bg-card">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="w-16"><span className="sr-only">Image</span></TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Prep</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((item) => (
                    <TableRow key={itemId(item)}>
                      <TableCell>
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted">
                          {item.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-48">
                        <p className="flex items-center gap-2 font-medium">
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-sm border ${item.is_veg ? "border-success bg-success" : "border-destructive bg-destructive"}`}
                            title={item.is_veg ? "Vegetarian" : "Non-vegetarian"}
                          />
                          <span className="sr-only">{item.is_veg ? "Vegetarian" : "Non-vegetarian"}</span>
                          {item.name}
                        </p>
                        {item.description ? <p className="line-clamp-1 text-xs text-muted-foreground">{item.description}</p> : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.category ?? item.category_id ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{item.outlet_id ?? "-"}</TableCell>
                      <TableCell className="text-right"><Money value={item.price ?? item.base_price} /></TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {item.prep_time_minutes != null ? `${item.prep_time_minutes} min` : "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(item.updated_at ?? item.created_at)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={Boolean(item.is_available)}
                          onCheckedChange={(v) => toggleAvailability(item, v)}
                          disabled={save.isPending}
                          aria-label={`${item.name} available`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(item)} aria-label={`Edit ${item.name}`}>
                            <Pencil strokeWidth={1.75} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleting(item)} aria-label={`Delete ${item.name}`}>
                            <Trash2 className="text-destructive" strokeWidth={1.75} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <MenuItemSheet
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setEditing(null);
        }}
        item={editing}
        categories={categoriesQuery.data ?? []}
        categoriesLoading={categoriesQuery.isLoading}
        outlets={outletsLoading ? [] : outlets}
        defaultOutlet={outletFilter !== ALL ? outletFilter : onlyOutlet}
        saving={save.isPending}
        onSubmit={submit}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete menu item?"
        description={deleting ? `${deleting.name} will be removed from the menu. This cannot be undone.` : undefined}
        confirmLabel="Delete"
        destructive
        loading={save.isPending}
        onConfirm={() => deleting && save.mutate({ action: "delete", id: itemId(deleting) })}
      />
    </AdminShell>
  );
}
