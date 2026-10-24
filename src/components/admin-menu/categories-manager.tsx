"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { ApiError, apiPost } from "@/lib/apiClient";
import { CategorySheet } from "./category-sheet";
import { useOutletKeys } from "./use-outlets";
import { categoryId, type CategoryPayload, type CategoryRecord } from "./types";

export function CategoriesManager() {
  const queryClient = useQueryClient();
  const { keys: outlets, isLoading: outletsLoading } = useOutletKeys();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRecord | null>(null);
  const [deleting, setDeleting] = useState<CategoryRecord | null>(null);

  const query = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => apiPost<CategoryRecord[]>("/admin/categories/manage", { action: "list" }, true),
  });
  const categories = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [query.data],
  );
  const nextOrder = categories.length ? Math.max(...categories.map((c) => c.sort_order ?? 0)) + 1 : 0;

  const mutation = useMutation({
    mutationFn: (vars: { action: "create" | "update" | "delete"; id?: string; data?: CategoryPayload }) =>
      apiPost("/admin/categories/manage", vars, true),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      setSheetOpen(false);
      setEditing(null);
      setDeleting(null);
      toast.success(vars.action === "delete" ? "Category deleted" : vars.action === "create" ? "Category created" : "Category updated");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save the category"),
  });

  const openNew = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  return (
    <AdminShell
      scope="admin"
      title="Categories"
      description="Menu sections and the order in which guests see them."
      actions={<Button size="sm" onClick={openNew}><Plus aria-hidden strokeWidth={1.75} /> Add category</Button>}
    >
      {query.isError ? (
        <EmptyState
          icon={Layers}
          title="Categories could not be loaded"
          description={query.error instanceof ApiError ? query.error.message : "Check your connection and try again."}
          action={<Button variant="outline" onClick={() => void query.refetch()}>Retry</Button>}
        />
      ) : query.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No categories yet"
          description="Create categories such as Starters or Main course, then assign dishes to them."
          action={<Button onClick={openNew}><Plus aria-hidden strokeWidth={1.75} /> Add category</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20 text-right">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={categoryId(c)}>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{c.sort_order ?? 0}</TableCell>
                  <TableCell className="min-w-48">
                    <p className="font-medium">{c.name}</p>
                    {c.description ? <p className="line-clamp-1 text-xs text-muted-foreground">{c.description}</p> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.outlet_id || "-"}</TableCell>
                  <TableCell>
                    <StatusBadge status={c.is_active ? "available" : "unavailable"} tone={c.is_active ? "success" : "muted"} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onClick={() => { setEditing(c); setSheetOpen(true); }}>
                        <Pencil strokeWidth={1.75} />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                        <Trash2 className="text-destructive" strokeWidth={1.75} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CategorySheet
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setEditing(null);
        }}
        category={editing}
        outlets={outlets}
        outletsLoading={outletsLoading}
        nextOrder={nextOrder}
        saving={mutation.isPending}
        onSubmit={(data) =>
          editing ? mutation.mutate({ action: "update", id: categoryId(editing), data }) : mutation.mutate({ action: "create", data })
        }
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete category?"
        description={deleting ? `${deleting.name} will be removed. Items assigned to it keep their current label.` : undefined}
        confirmLabel="Delete"
        destructive
        loading={mutation.isPending}
        onConfirm={() => deleting && mutation.mutate({ action: "delete", id: categoryId(deleting) })}
      />
    </AdminShell>
  );
}
