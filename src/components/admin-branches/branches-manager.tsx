"use client";

import { useMemo, useState } from "react";
import { Building2, MapPin, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataToolbar } from "@/components/admin/data-toolbar";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { getAdminOutlets, hasOutletAccess } from "@/hooks/useAdminAccess";
import { apiPost } from "@/lib/apiClient";
import { BranchFormSheet } from "./branch-form-sheet";
import { toBranch, type Branch } from "./types";

const KEY = ["admin-branches"];
type StatusFilter = "all" | "active" | "inactive";

type Variables =
  | { action: "create"; data: Record<string, unknown> }
  | { action: "update"; id: string; data: Record<string, unknown> }
  | { action: "delete"; id: string };

const messageOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function BranchesManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState<Branch | null>(null);

  const { data: branches = [], isLoading, isFetching, isError, error } = useQuery<Branch[], Error>({
    queryKey: KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiPost<{ outlets?: Record<string, unknown>[] }>("/admin/outlets/manage", { action: "list" }, true);
      return (res?.outlets ?? []).map(toBranch).filter((b): b is Branch => b !== null);
    },
  });

  const allowed = useMemo(() => getAdminOutlets(), []);
  const canManage = (b: Branch) => hasOutletAccess(allowed, b.location_key);

  const mutation = useMutation({
    mutationFn: (vars: Variables) => apiPost("/admin/outlets/manage", vars, true),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["public-outlets"] });
      queryClient.invalidateQueries({ queryKey: ["validated-location"] });
      if (vars.action !== "delete") {
        setFormOpen(false);
        setEditing(null);
      }
      toast.success(vars.action === "delete" ? "Branch deleted." : vars.action === "update" ? "Branch updated." : "Branch added.");
    },
    onError: (err) => toast.error(messageOf(err, "Could not save the branch.")),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return branches
      .filter((b) => (status === "all" ? true : status === "active" ? b.is_active : !b.is_active))
      .filter((b) => !q || [b.location_key, b.name, b.address, b.contact_number, b.contact_email].join(" ").toLowerCase().includes(q))
      .sort((a, b) => (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) || (a.name || a.location_key).localeCompare(b.name || b.location_key));
  }, [branches, search, status]);

  const openForm = (branch: Branch | null) => {
    if (branch && !canManage(branch)) return toast.error("You do not have permission to modify this branch.");
    setEditing(branch);
    setFormOpen(true);
  };

  const filtering = search.trim() !== "" || status !== "all";

  return (
    <AdminShell
      scope="admin"
      title="Branches"
      description="Locations that rooms, menus, bookings and reports belong to"
      actions={
        <>
          <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: KEY })} disabled={isFetching}>
            <RefreshCw className={isFetching ? "animate-spin" : undefined} strokeWidth={1.75} aria-hidden />
            Refresh
          </Button>
          <Button onClick={() => openForm(null)}>
            <Plus strokeWidth={1.75} aria-hidden />
            Add branch
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <DataToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search name, key or contact"
          filters={
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="w-[9rem]" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error.message || "Branches could not be loaded."}
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={filtering ? "No branches match" : "No branches yet"}
            description={filtering ? "Clear the search or status filter to see all branches." : "Add a branch before creating rooms, tables or menus."}
            action={!filtering ? <Button onClick={() => openForm(null)}>Add branch</Button> : undefined}
          />
        ) : (
          <>
            <div className="max-h-[70vh] overflow-auto rounded-md border border-border bg-card">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Branch</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Address</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Contact</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((b) => {
                    const label = b.name || b.location_key;
                    const manageable = canManage(b);
                    return (
                      <tr key={b.id} className="align-top hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <div className="font-medium">{label}</div>
                          <div className="font-mono text-xs text-muted-foreground">{b.location_key}</div>
                          {!manageable ? (
                            <Badge variant="outline" className="mt-1.5 font-normal">
                              View only
                            </Badge>
                          ) : null}
                        </td>
                        <td className="max-w-[20rem] px-4 py-3">
                          {b.address ? <p className="text-muted-foreground">{b.address}</p> : <span className="text-muted-foreground">-</span>}
                          {b.google_maps_url ? (
                            <a href={b.google_maps_url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
                              <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                              View on map
                            </a>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {b.contact_number || b.contact_email ? (
                            <>
                              {b.contact_number ? <div className="tabular-nums">{b.contact_number}</div> : null}
                              {b.contact_email ? <div className="text-xs text-muted-foreground">{b.contact_email}</div> : null}
                            </>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={b.is_active ? "Active" : "Inactive"} tone={b.is_active ? "success" : "muted"} />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex justify-end">
                            <Button variant="ghost" size="icon" onClick={() => openForm(b)} disabled={!manageable || mutation.isPending} aria-label={`Edit ${label}`}>
                              <Pencil strokeWidth={1.75} aria-hidden />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleting(b)} disabled={!manageable || mutation.isPending} aria-label={`Delete ${label}`}>
                              <Trash2 className="text-destructive" strokeWidth={1.75} aria-hidden />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-sm tabular-nums text-muted-foreground">
              {rows.length} of {branches.length} {branches.length === 1 ? "branch" : "branches"}
            </p>
          </>
        )}
      </div>

      <BranchFormSheet
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        branch={editing}
        existingKeys={branches.map((b) => b.location_key)}
        saving={mutation.isPending}
        onSubmit={(data, id) => mutation.mutate(id ? { action: "update", id, data } : { action: "create", data })}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete ${deleting.name || deleting.location_key}?` : "Delete branch?"}
        description="Rooms, menus and bookings that reference this branch will no longer resolve to it. This cannot be undone. Mark the branch inactive if you only need to hide it."
        confirmLabel="Delete branch"
        destructive
        loading={mutation.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await mutation.mutateAsync({ action: "delete", id: deleting.id });
          } catch {
            // surfaced by the mutation's toast
          }
          setDeleting(null);
        }}
      />
    </AdminShell>
  );
}
