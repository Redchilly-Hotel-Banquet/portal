"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { OutletMultiSelect } from "@/components/admin-menu/outlet-multi-select";
import { toBranch, type Branch } from "@/components/admin-branches/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/apiClient";
import { getAdminOutlets } from "@/hooks/useAdminAccess";
import { MAX_TEMPLATE_VARIABLES, MAX_VARIABLE_VALUE, RESERVED_TEMPLATE_KEYS, normaliseTemplateVariables, templateVariableError, type TemplateVariable } from "@/lib/template-variables";

const KEY = ["template-variables"];

/** A row being edited; `all` is "every branch, including ones added later". */
type Row = { key: string; value: string; all: boolean; outlets: string[] };

const toRow = (v: TemplateVariable): Row => ({ key: v.key, value: v.value, all: v.outlets.length === 0, outlets: v.outlets });
const toVariable = (r: Row): TemplateVariable => ({ key: r.key.trim().toLowerCase(), value: r.value, outlets: r.all ? [] : r.outlets });

/** Message variables: a name and a value, for one branch, several or all, usable in the WhatsApp message as {name}. */
export function TemplateVariablesPanel() {
  const queryClient = useQueryClient();
  const canEdit = getAdminOutlets().includes("all");
  const [rows, setRows] = useState<Row[]>([]);

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => apiPost<{ template_variables?: unknown }>("/admin/config", { action: "get" }, true),
    select: (data) => normaliseTemplateVariables(data?.template_variables),
    refetchOnWindowFocus: false,
  });
  const branches = useQuery<Branch[]>({
    queryKey: ["admin-branches"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await apiPost<{ outlets?: Record<string, unknown>[] }>("/admin/outlets/manage", { action: "list" }, true);
      return (res?.outlets ?? []).map(toBranch).filter((b): b is Branch => b !== null);
    },
  });
  useEffect(() => {
    if (query.data) setRows(query.data.map(toRow));
  }, [query.data]);

  const names = new Map((branches.data ?? []).map((b) => [b.location_key, b.name || b.location_key]));
  const variables = rows.map(toVariable);
  const problem = rows.length ? templateVariableError(variables, (branches.data ?? []).map((b) => b.location_key)) : null;
  const scopeError = rows.some((r) => !r.all && r.outlets.length === 0) ? "Choose at least one branch, or switch on every branch." : null;
  const dirty = JSON.stringify(variables) !== JSON.stringify(query.data ?? []);

  const save = useMutation({
    mutationFn: () => apiPost("/admin/config", { action: "update_template_variables", template_variables: variables }, true),
    onSuccess: () => {
      toast.success("Variables saved");
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save the variables"),
  });

  const patch = (index: number, change: Partial<Row>) => setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...change } : row)));

  return (
    <section className="max-w-3xl space-y-4 rounded-md border border-border bg-card p-5">
      <div>
        <h2 className="text-lg">Message variables</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your own placeholders for the WhatsApp welcome message, such as breakfast timings or the helpdesk number. Write {"{name}"} in a branch's message wording under Branch details. A variable can be set for one branch, several or all. If a branch has both its own and an every-branch value for a name, its own is used.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Built in already: {RESERVED_TEMPLATE_KEYS.filter((k) => k !== "hotel_key").map((k) => `{${k}}`).join(" ")}</p>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading</p>
      ) : (
        <>
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">No variables yet.</p> : null}
          <ul className="space-y-3">
            {rows.map((row, index) => (
              <li key={index} className="space-y-3 rounded-md border border-border p-3">
                <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-start">
                  <div className="space-y-1">
                    <Label htmlFor={`v-key-${index}`} className="text-xs">Name</Label>
                    <Input id={`v-key-${index}`} value={row.key} disabled={!canEdit} onChange={(e) => patch(index, { key: e.target.value.toLowerCase().replace(/\s+/g, "_") })} placeholder="breakfast_time" autoComplete="off" className="font-mono text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`v-value-${index}`} className="text-xs">Value</Label>
                    <Textarea id={`v-value-${index}`} rows={2} maxLength={MAX_VARIABLE_VALUE} value={row.value} disabled={!canEdit} onChange={(e) => patch(index, { value: e.target.value })} placeholder="7 to 10 am" />
                  </div>
                  {canEdit ? (
                    <Button type="button" variant="ghost" size="icon" className="sm:mt-5" aria-label={`Remove ${row.key || "variable"}`} onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </Button>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor={`v-all-${index}`} className="text-sm">Every branch, including ones added later</label>
                  <Switch id={`v-all-${index}`} checked={row.all} disabled={!canEdit} onCheckedChange={(all) => patch(index, { all })} />
                </div>
                {row.all ? null : (
                  <OutletMultiSelect
                    outlets={Array.from(names.keys())}
                    selected={row.outlets}
                    onChange={(outlets) => patch(index, { outlets })}
                    disabled={canEdit ? {} : Object.fromEntries(Array.from(names.keys()).map((k) => [k, "view only"]))}
                    loading={branches.isLoading}
                  />
                )}
              </li>
            ))}
          </ul>
          {problem || scopeError ? <p role="alert" className="text-xs text-destructive">{scopeError ?? problem}</p> : null}
          {canEdit ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" disabled={rows.length >= MAX_TEMPLATE_VARIABLES} onClick={() => setRows((prev) => [...prev, { key: "", value: "", all: true, outlets: [] }])}>
                <Plus className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
                Add a variable
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" disabled={!dirty || save.isPending} onClick={() => setRows((query.data ?? []).map(toRow))}>
                  Discard changes
                </Button>
                <Button type="button" disabled={!dirty || save.isPending || Boolean(problem || scopeError)} onClick={() => save.mutate()}>
                  {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                  Save variables
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Only an all-branch administrator can change these.</p>
          )}
        </>
      )}
    </section>
  );
}
