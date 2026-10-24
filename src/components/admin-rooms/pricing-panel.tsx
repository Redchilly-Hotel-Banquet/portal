"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { formatDate } from "@/components/admin/format";
import { Money } from "@/components/admin/money";
import { StatusBadge } from "@/components/admin/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { PricingRule, PricingRulePayload, RoomRecord } from "./types";
import { PricingRuleSheet } from "./pricing-rule-sheet";
import { usePricingMutations, usePricingRules } from "./use-rooms-api";
import { ruleState } from "./utils";

type Props = {
  rooms: RoomRecord[];
  outlets: string[];
  creating: boolean;
  onCreatingChange: (open: boolean) => void;
};

const STATE_TONE = { active: "success", scheduled: "primary", expired: "muted" } as const;

export function PricingPanel({ rooms, outlets, creating, onCreatingChange }: Props) {
  const { data: rules = [], isLoading, isError, error } = usePricingRules();
  const { create, remove } = usePricingMutations(() => onCreatingChange(false));
  const [pendingDelete, setPendingDelete] = useState<PricingRule | null>(null);

  const roomCodes = useMemo(() => new Map(rooms.map((r) => [r.id, r.code])), [rooms]);
  const visible = useMemo(() => rules.filter((r) => outlets.includes(r.outlet_id)), [rules, outlets]);

  const scopeLabel = (rule: PricingRule) => {
    if (rule.room_ids.length === 0) return "All rooms";
    return rule.room_ids.map((id) => roomCodes.get(id) ?? "Removed room").join(", ");
  };

  return (
    <section aria-labelledby="pricing-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Rate adjustments</p>
          <h2 id="pricing-heading" className="text-xl">
            Pricing rules
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Temporary changes to nightly rates, applied by date. When several rules overlap on a night, percentage changes are added together.
          </p>
        </div>
        <Button onClick={() => onCreatingChange(true)}>
          <Plus strokeWidth={1.75} aria-hidden />
          New rule
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error.message || "Pricing rules could not be loaded."}
        </p>
      ) : visible.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No pricing rules" description="Rooms are charged at their base rate. Add a rule for festivals, weddings or off-season offers." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Period</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Branch</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Applies to</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Adjustment</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="w-12 px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((rule) => {
                const state = ruleState(rule);
                return (
                  <tr key={rule.id} className="align-top">
                    <td className="px-4 py-3 tabular-nums">
                      <div>
                        {formatDate(rule.start_date)} to {rule.end_date ? formatDate(rule.end_date) : "no end date"}
                      </div>
                      {rule.notes ? <div className="mt-0.5 text-xs text-muted-foreground">{rule.notes}</div> : null}
                    </td>
                    <td className="px-4 py-3">{rule.outlet_id}</td>
                    <td className="max-w-[16rem] px-4 py-3 text-muted-foreground">{scopeLabel(rule)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {rule.mode === "FIXED" ? (
                        <span>
                          <Money value={rule.fixed_rate ?? 0} className="font-medium" /> <span className="text-xs text-muted-foreground">per night</span>
                        </span>
                      ) : (
                        <span className="font-medium">
                          {rule.percent_increase > 0 ? "+" : ""}
                          {rule.percent_increase}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={state} tone={STATE_TONE[state]} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => setPendingDelete(rule)} aria-label={`Remove rule starting ${formatDate(rule.start_date)}`}>
                        <Trash2 className="text-destructive" strokeWidth={1.75} aria-hidden />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PricingRuleSheet
        open={creating}
        onOpenChange={onCreatingChange}
        outlets={outlets}
        rooms={rooms}
        saving={create.isPending}
        onSubmit={(rule: PricingRulePayload) => create.mutate(rule)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Remove this pricing rule?"
        description="Rates quoted after removal use the base rate or the remaining rules."
        confirmLabel="Remove rule"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
          } catch {
            // surfaced by the mutation's toast
          }
          setPendingDelete(null);
        }}
      />
    </section>
  );
}
