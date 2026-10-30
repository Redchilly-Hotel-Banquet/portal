"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { OutletMultiSelect } from "@/components/admin-menu/outlet-multi-select";
import { toBranch, type Branch } from "@/components/admin-branches/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getAdminOutlets } from "@/hooks/useAdminAccess";
import { apiPost } from "@/lib/apiClient";
import {
  CHECKIN_RULE_FIELDS,
  DEFAULT_CHECKIN_RULES,
  checkinRuleSetsError,
  normaliseCheckinRuleSets,
  type CheckinRuleSet,
  type CheckinRules,
} from "@/lib/checkin-rules";
import { TemplateVariablesPanel } from "./template-variables-panel";

const KEY = ["checkin-rules"];

/** Turning on "either one" while neither phone nor email is mandatory makes the phone number mandatory too. */
const toggle = (rules: CheckinRules, key: keyof CheckinRules, value: boolean): CheckinRules => {
  const next = { ...rules, [key]: value };
  if (key === "contact_either" && value && !next.contact_phone && !next.contact_email) next.contact_phone = true;
  return next;
};

/** Business configuration. Check-in rules are set for every branch or for chosen ones; message variables work the same way. */
export function ConfigPanel() {
  const queryClient = useQueryClient();
  const canEdit = getAdminOutlets().includes("all");
  const [sets, setSets] = useState<CheckinRuleSet[]>([]);

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => apiPost<{ checkin_rule_sets?: unknown }>("/admin/config", { action: "get" }, true),
    select: (data) => normaliseCheckinRuleSets(data?.checkin_rule_sets),
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
  // Always show an every-branch set first; it is what any branch without its own set follows.
  useEffect(() => {
    if (!query.data) return;
    const all = query.data.find((set) => set.outlets.length === 0) ?? { outlets: [], rules: DEFAULT_CHECKIN_RULES };
    setSets([all, ...query.data.filter((set) => set.outlets.length > 0)]);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => apiPost("/admin/config", { action: "update_checkin_rules", checkin_rule_sets: sets }, true),
    onSuccess: () => {
      toast.success("Configuration saved");
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save the configuration"),
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError) return <p role="alert" className="text-sm text-destructive">Configuration could not be loaded.</p>;

  const names = new Map((branches.data ?? []).map((b) => [b.location_key, b.name || b.location_key]));
  const patch = (index: number, change: Partial<CheckinRuleSet>) => setSets((prev) => prev.map((set, i) => (i === index ? { ...set, ...change } : set)));
  const taken = (index: number) => new Set(sets.flatMap((set, i) => (i === index ? [] : set.outlets)));
  const emptyScope = sets.some((set, i) => i > 0 && set.outlets.length === 0);
  const problem = emptyScope ? "Choose at least one branch for each extra set of rules." : checkinRuleSetsError(sets, Array.from(names.keys()));
  const baseline = (() => {
    const all = query.data?.find((set) => set.outlets.length === 0) ?? { outlets: [], rules: DEFAULT_CHECKIN_RULES };
    return [all, ...(query.data ?? []).filter((set) => set.outlets.length > 0)];
  })();
  const dirty = JSON.stringify(sets) !== JSON.stringify(baseline);

  return (
    <div className="space-y-6">
      <TemplateVariablesPanel />
      <form
        className="max-w-3xl space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (problem) return toast.error(problem);
          save.mutate();
        }}
      >
        <div>
          <h2 className="text-lg">Check-in from the admin page</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose what reception must collect to check a guest in. Switch a detail off to make it optional. The first set applies to every branch; add another set to give chosen branches their own rules. This does not change what guests are asked when they check in online.
          </p>
        </div>

        {sets.map((set, index) => (
          <section key={index} className="space-y-4 rounded-md border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-medium">
                  {index === 0 ? "Every branch" : `Chosen branches: ${set.outlets.map((key) => names.get(key) ?? key).join(", ") || "none yet"}`}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {index === 0 ? "Used by any branch that has no set of its own below, including branches added later." : "Used by these branches instead of the every-branch rules."}
                </p>
              </div>
              {canEdit && index > 0 ? (
                <Button type="button" variant="ghost" size="icon" aria-label="Remove this set of rules" onClick={() => setSets((prev) => prev.filter((_, i) => i !== index))}>
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </Button>
              ) : null}
            </div>

            {index > 0 ? (
              <OutletMultiSelect
                outlets={Array.from(names.keys())}
                selected={set.outlets}
                onChange={(outlets) => patch(index, { outlets })}
                disabled={Object.fromEntries(Array.from(names.keys()).flatMap((key) => (!canEdit ? [[key, "view only"]] : taken(index).has(key) ? [[key, "in another set"]] : [])))}
                loading={branches.isLoading}
              />
            ) : null}

            <ul className="divide-y divide-border">
              <li className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">Guest name</p>
                  <p className="text-xs text-muted-foreground">Always required.</p>
                </div>
                <Switch checked disabled aria-label="Guest name is always required" />
              </li>
              {CHECKIN_RULE_FIELDS.map((field) => (
                <li key={field.key} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <label htmlFor={`rule-${index}-${field.key}`} className="text-sm font-medium">{field.label}</label>
                    <p className="text-xs text-muted-foreground">{field.hint}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-right text-xs text-muted-foreground">{set.rules[field.key] ? "Mandatory" : "Optional"}</span>
                    <Switch id={`rule-${index}-${field.key}`} checked={set.rules[field.key]} disabled={!canEdit} onCheckedChange={(value) => patch(index, { rules: toggle(set.rules, field.key, value) })} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {canEdit ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setSets((prev) => [...prev, { outlets: [], rules: { ...sets[0].rules } }])}>
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
            Add rules for chosen branches
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Only an all-branch administrator can change these.</p>
        )}
        {problem ? <p role="alert" className="text-xs text-destructive">{problem}</p> : null}

        {canEdit ? (
          <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t bg-background px-1 py-3">
            <Button type="button" variant="ghost" disabled={!dirty || save.isPending} onClick={() => query.data && setSets(baseline)}>
              Discard changes
            </Button>
            <Button type="submit" disabled={!dirty || save.isPending || Boolean(problem)}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Save configuration
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
