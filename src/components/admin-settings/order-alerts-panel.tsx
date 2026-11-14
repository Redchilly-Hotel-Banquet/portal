"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOutlets } from "@/hooks/useAdminAccess";
import { apiPost } from "@/lib/apiClient";
import { optionalPhoneError } from "@/lib/phone";
import { DEFAULT_ORDER_ALERT_TEMPLATE, ORDER_ALERT_PLACEHOLDERS, renderTemplate } from "@/lib/whatsapp-template";
import { Textarea } from "@/components/ui/textarea";

const KEY = ["order-alert-numbers"];

/** WhatsApp numbers told about every order that does not come from the admin portal. */
export function OrderAlertsPanel() {
  const queryClient = useQueryClient();
  const canEdit = getAdminOutlets().includes("all");
  const [numbers, setNumbers] = useState<string[]>([]);
  const [template, setTemplate] = useState("");

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => apiPost<{ order_alert_numbers?: string[]; order_alert_template?: string }>("/admin/config", { action: "get" }, true),
    select: (data) => ({ numbers: data?.order_alert_numbers ?? [], template: data?.order_alert_template ?? "" }),
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (query.data) {
      setNumbers(query.data.numbers);
      setTemplate(query.data.template);
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => apiPost("/admin/config", { action: "update_order_alerts", order_alert_numbers: numbers.filter((n) => n.trim()), order_alert_template: template.trim() === DEFAULT_ORDER_ALERT_TEMPLATE ? "" : template }, true),
    onSuccess: () => {
      toast.success("Order alerts saved");
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save the numbers"),
  });

  if (query.isLoading) return <Skeleton className="h-40 w-full" />;
  if (query.isError) return <p role="alert" className="text-sm text-destructive">Order alerts could not be loaded.</p>;

  const problem = numbers.map((n) => optionalPhoneError(n)).find(Boolean) ?? "";
  const dirty =
    JSON.stringify(numbers.filter((n) => n.trim())) !== JSON.stringify(query.data?.numbers ?? []) ||
    (template.trim() === DEFAULT_ORDER_ALERT_TEMPLATE ? "" : template.trim()) !== (query.data?.template ?? "").trim();
  const preview = renderTemplate(template.trim() || DEFAULT_ORDER_ALERT_TEMPLATE, {
    branch: "Red Chilly Lucknow",
    location: "Room 101",
    items: "• 2 x Paneer Tikka\n• 1 x Butter Naan (extra butter)",
    note: "Note: Less spicy please",
    total: "640",
  });

  return (
    <form
      className="max-w-3xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (problem) return toast.error(problem);
        save.mutate();
      }}
    >
      <div>
        <h2 className="text-lg">Kitchen order alerts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These WhatsApp numbers get a message whenever an order reaches the kitchen from somewhere other than the admin portal, such as a guest ordering from their room or table. Orders entered by staff in the admin portal do not send one.
        </p>
      </div>
      <section className="space-y-3 rounded-md border border-border bg-card p-5">
        {numbers.length === 0 ? <p className="text-sm text-muted-foreground">No numbers yet, so no alerts are sent.</p> : null}
        {numbers.map((number, index) => (
          <div key={index} className="flex items-center gap-2">
            <PhoneInput
              id={`alert-${index}`}
              value={number}
              disabled={!canEdit}
              invalid={Boolean(optionalPhoneError(number))}
              onChange={(value) => setNumbers((prev) => prev.map((n, i) => (i === index ? value : n)))}
              className="flex-1"
            />
            {canEdit ? (
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove number ${index + 1}`} onClick={() => setNumbers((prev) => prev.filter((_, i) => i !== index))}>
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}
        {canEdit ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setNumbers((prev) => [...prev, ""])}>
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
            Add a number
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Only an all-branch administrator can change these.</p>
        )}
        {problem ? <p role="alert" className="text-xs text-destructive">{problem}</p> : null}
      </section>
      <section className="space-y-4 rounded-md border border-border bg-card p-5">
        <div>
          <h3 className="text-base font-medium">Message wording</h3>
          <p className="mt-1 text-xs text-muted-foreground">Leave as it is to use the standard message. A line whose details are empty is left out.</p>
        </div>
        <Textarea id="alert-template" rows={9} disabled={!canEdit} value={template || DEFAULT_ORDER_ALERT_TEMPLATE} onChange={(e) => setTemplate(e.target.value)} className="font-mono text-xs" />
        <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          {ORDER_ALERT_PLACEHOLDERS.map((p) => (
            <div key={p.key} className="flex gap-2">
              <dt className="font-mono text-foreground">{`{${p.key}}`}</dt>
              <dd className="text-muted-foreground">{p.description}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="mb-1 text-sm font-medium">Preview</p>
          <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-sans text-sm">{preview}</pre>
          {canEdit ? <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setTemplate("")}>Use the standard wording</Button> : null}
        </div>
      </section>
      {canEdit ? (
        <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t bg-background px-1 py-3">
          <Button type="button" variant="ghost" disabled={!dirty || save.isPending} onClick={() => { setNumbers(query.data?.numbers ?? []); setTemplate(query.data?.template ?? ""); }}>Discard changes</Button>
          <Button type="submit" disabled={!dirty || save.isPending || Boolean(problem)}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            Save
          </Button>
        </div>
      ) : null}
    </form>
  );
}
