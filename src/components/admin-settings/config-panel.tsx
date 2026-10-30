"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiPost } from "@/lib/apiClient";
import { CHECKIN_RULE_FIELDS, DEFAULT_CHECKIN_RULES, normaliseCheckinRules, type CheckinRules } from "@/lib/checkin-rules";

const KEY = ["checkin-rules"];

/** Turning on "either one" while neither phone nor email is mandatory makes the phone number mandatory too. */
const toggle = (rules: CheckinRules, key: keyof CheckinRules, value: boolean): CheckinRules => {
  const next = { ...rules, [key]: value };
  if (key === "contact_either" && value && !next.contact_phone && !next.contact_email) next.contact_phone = true;
  return next;
};

/** Business-wide configuration. New groups of settings go here as further sections. */
export function ConfigPanel() {
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<CheckinRules>(DEFAULT_CHECKIN_RULES);

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => apiPost<{ checkin_rules?: unknown }>("/admin/config", { action: "get" }, true),
    select: (data) => normaliseCheckinRules(data?.checkin_rules),
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (query.data) setRules(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => apiPost("/admin/config", { action: "update_checkin_rules", checkin_rules: rules }, true),
    onSuccess: () => {
      toast.success("Configuration saved");
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save the configuration"),
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError) return <p role="alert" className="text-sm text-destructive">Configuration could not be loaded.</p>;

  const dirty = JSON.stringify(rules) !== JSON.stringify(query.data);

  return (
    <form
      className="max-w-3xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <section className="space-y-4 rounded-md border border-border bg-card p-5">
        <div>
          <h2 className="text-lg">Check-in from the admin page</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose what reception must collect to check a guest in. Switch a detail off to make it optional. This applies to every branch, and does not change what guests are asked when they check in online.
          </p>
        </div>
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
                <label htmlFor={`rule-${field.key}`} className="text-sm font-medium">{field.label}</label>
                <p className="text-xs text-muted-foreground">{field.hint}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 text-right text-xs text-muted-foreground">{rules[field.key] ? "Mandatory" : "Optional"}</span>
                <Switch id={`rule-${field.key}`} checked={rules[field.key]} onCheckedChange={(value) => setRules((prev) => toggle(prev, field.key, value))} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t bg-background px-1 py-3">
        <Button type="button" variant="ghost" disabled={!dirty || save.isPending} onClick={() => query.data && setRules(query.data)}>
          Discard changes
        </Button>
        <Button type="submit" disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          Save configuration
        </Button>
      </div>
    </form>
  );
}
