"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toBranch, type Branch, type WifiFloorRow } from "@/components/admin-branches/types";
import { getAdminOutlets, hasOutletAccess } from "@/hooks/useAdminAccess";
import { apiPost } from "@/lib/apiClient";
import { DEFAULT_WHATSAPP_TEMPLATE, TEMPLATE_PLACEHOLDERS, renderTemplate } from "@/lib/whatsapp-template";

const KEY = ["admin-branches"];

type Form = {
  legal_name: string;
  gstin: string;
  invoice_address: string;
  invoice_phone: string;
  invoice_email: string;
  invoice_terms: string;
  wifi_name: string;
  wifi_password: string;
  wifi_floors: WifiFloorRow[];
  welcome_message: string;
  whatsapp_template: string;
};

const fromBranch = (b: Branch): Form => ({
  legal_name: b.legal_name,
  gstin: b.gstin,
  invoice_address: b.invoice_address,
  invoice_phone: b.invoice_phone,
  invoice_email: b.invoice_email,
  invoice_terms: b.invoice_terms,
  wifi_name: b.wifi_name,
  wifi_password: b.wifi_password,
  wifi_floors: b.wifi_floors.map((row) => ({ ...row })),
  welcome_message: b.welcome_message,
  whatsapp_template: b.whatsapp_template,
});

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-md border border-border bg-card p-5">
      <div>
        <h2 className="text-lg">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SettingsManager() {
  const queryClient = useQueryClient();
  const allowed = useMemo(() => getAdminOutlets(), []);
  const [branchKey, setBranchKey] = useState("");
  const [form, setForm] = useState<Form | null>(null);

  const { data: branches = [], isLoading, isError, error } = useQuery<Branch[], Error>({
    queryKey: KEY,
    // Refetching under an open form would throw away what has been typed.
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await apiPost<{ outlets?: Record<string, unknown>[] }>("/admin/outlets/manage", { action: "list" }, true);
      return (res?.outlets ?? []).map(toBranch).filter((b): b is Branch => b !== null);
    },
  });
  const editable = branches.filter((b) => hasOutletAccess(allowed, b.location_key));
  const branch = editable.find((b) => b.location_key === branchKey) ?? null;

  useEffect(() => {
    if (!branchKey && editable.length > 0) setBranchKey(editable[0].location_key);
  }, [branchKey, editable]);
  useEffect(() => {
    setForm(branch ? fromBranch(branch) : null);
    // Reload the form when another branch is chosen or the saved data changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch?.id, branches]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  const setFloor = (index: number, patch: Partial<WifiFloorRow>) =>
    setForm((prev) => (prev ? { ...prev, wifi_floors: prev.wifi_floors.map((row, i) => (i === index ? { ...row, ...patch } : row)) } : prev));

  const gstinError = form && form.gstin.trim() && !GSTIN.test(form.gstin.replace(/\s+/g, "").toUpperCase()) ? "That is not a valid GST number. It has 15 letters and digits, for example 09ABCDE1234F1Z5." : "";

  const save = useMutation({
    mutationFn: () =>
      apiPost(
        "/admin/outlets/manage",
        {
          action: "update",
          id: branch?.id,
          data: {
            ...form,
            gstin: form?.gstin.replace(/\s+/g, "").toUpperCase(),
            wifi_floors: (form?.wifi_floors ?? []).filter((row) => row.floor.trim()),
            whatsapp_template: form?.whatsapp_template.trim() === DEFAULT_WHATSAPP_TEMPLATE ? "" : form?.whatsapp_template,
          },
        },
        true,
      ),
    onSuccess: () => {
      toast.success("Settings saved");
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save the settings"),
  });

  const preview = useMemo(() => {
    if (!form) return "";
    const firstFloor = form.wifi_floors.find((row) => row.floor.trim() && (row.wifi_name || row.wifi_password));
    const name = firstFloor?.wifi_name || form.wifi_name;
    const password = firstFloor?.wifi_password || form.wifi_password;
    return renderTemplate(form.whatsapp_template.trim() || DEFAULT_WHATSAPP_TEMPLATE, {
      guest: "Asha Verma",
      hotel: branch?.name || branch?.location_key || "Red Chilly",
      room: "101",
      checkin_id: "123456",
      wifi: [name ? `Wi-Fi: ${name}` : "", password ? `Wi-Fi password: ${password}` : ""].filter(Boolean).join("\n"),
      note: form.welcome_message,
    });
  }, [form, branch]);

  return (
    <AdminShell scope="admin" title="Settings" description="Invoice details, GST number, Wi-Fi and the WhatsApp welcome message, for each branch.">
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">{error.message || "Settings could not be loaded."}</p>
      ) : editable.length === 0 ? (
        <EmptyState icon={SettingsIcon} title="No branches to configure" description="Add a branch first, or ask an administrator with access to one." />
      ) : (
        <div className="max-w-3xl space-y-6">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="settings-branch">Branch</Label>
            <Select value={branchKey} onValueChange={setBranchKey}>
              <SelectTrigger id="settings-branch"><SelectValue /></SelectTrigger>
              <SelectContent>
                {editable.map((b) => (
                  <SelectItem key={b.id} value={b.location_key}>{b.name || b.location_key}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form ? (
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (gstinError) return toast.error(gstinError);
                save.mutate();
              }}
            >
              <Section title="Invoice details" description="Printed on every invoice for this branch. Anything left blank falls back to the branch's own name, address and contact.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="s-legal" label="Business name on invoices">
                    <Input id="s-legal" value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} placeholder={branch?.name} />
                  </Field>
                  <Field id="s-gstin" label="GST number (GSTIN)" hint="15 characters, for example 09ABCDE1234F1Z5.">
                    <Input id="s-gstin" value={form.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} maxLength={15} autoComplete="off" aria-invalid={Boolean(gstinError)} className="font-mono tracking-wide" />
                    {gstinError ? <p role="alert" className="text-xs text-destructive">{gstinError}</p> : null}
                  </Field>
                </div>
                <Field id="s-address" label="Address on invoices">
                  <Textarea id="s-address" rows={3} value={form.invoice_address} onChange={(e) => set("invoice_address", e.target.value)} placeholder={branch?.address} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="s-phone" label="Phone on invoices">
                    <Input id="s-phone" type="tel" value={form.invoice_phone} onChange={(e) => set("invoice_phone", e.target.value)} placeholder={branch?.contact_number} />
                  </Field>
                  <Field id="s-email" label="Email on invoices">
                    <Input id="s-email" type="email" value={form.invoice_email} onChange={(e) => set("invoice_email", e.target.value)} placeholder={branch?.contact_email} />
                  </Field>
                </div>
                <Field id="s-terms" label="Terms and notes at the foot of the invoice" hint="For example refund policy, the place of supply or a thank-you line.">
                  <Textarea id="s-terms" rows={3} value={form.invoice_terms} onChange={(e) => set("invoice_terms", e.target.value)} />
                </Field>
              </Section>

              <Section title="Wi-Fi" description="Sent to guests in the welcome message. A guest gets the Wi-Fi for the floor of their room.">
                <div className="space-y-3">
                  {form.wifi_floors.map((row, index) => (
                    <div key={index} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[6rem_1fr_1fr_auto] sm:items-end">
                      <div className="space-y-1">
                        <Label htmlFor={`f-floor-${index}`} className="text-xs">Floor</Label>
                        <Input id={`f-floor-${index}`} value={row.floor} onChange={(e) => setFloor(index, { floor: e.target.value })} placeholder="Ground" autoComplete="off" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`f-name-${index}`} className="text-xs">Wi-Fi name</Label>
                        <Input id={`f-name-${index}`} value={row.wifi_name} onChange={(e) => setFloor(index, { wifi_name: e.target.value })} autoComplete="off" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`f-pass-${index}`} className="text-xs">Password</Label>
                        <Input id={`f-pass-${index}`} value={row.wifi_password} onChange={(e) => setFloor(index, { wifi_password: e.target.value })} autoComplete="off" />
                      </div>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove floor ${row.floor || index + 1}`} onClick={() => set("wifi_floors", form.wifi_floors.filter((_, i) => i !== index))}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => set("wifi_floors", [...form.wifi_floors, { floor: "", wifi_name: "", wifi_password: "" }])}>
                    <Plus className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
                    Add a floor
                  </Button>
                  <p className="text-xs text-muted-foreground">Type the floor as it is on the room (its Floor field), for example Ground or 1.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="s-wifi" label="Default Wi-Fi name" hint="For rooms whose floor is not listed above.">
                    <Input id="s-wifi" value={form.wifi_name} onChange={(e) => set("wifi_name", e.target.value)} autoComplete="off" />
                  </Field>
                  <Field id="s-wifipass" label="Default Wi-Fi password">
                    <Input id="s-wifipass" value={form.wifi_password} onChange={(e) => set("wifi_password", e.target.value)} autoComplete="off" />
                  </Field>
                </div>
              </Section>

              <Section title="WhatsApp welcome message" description="What reception sends a guest from the booking, with their check-in ID and Wi-Fi.">
                <Field id="s-note" label="Welcome note" hint="Added at the end through {note}. For example breakfast timings or the front desk number.">
                  <Textarea id="s-note" rows={3} value={form.welcome_message} onChange={(e) => set("welcome_message", e.target.value)} placeholder="Breakfast 7 to 10 am. Dial 9 for the front desk. Check-out is at 11 am." />
                </Field>
                <Field id="s-template" label="Message wording" hint="Leave as it is to use the standard message. A line whose details are empty is left out.">
                  <Textarea id="s-template" rows={9} value={form.whatsapp_template || DEFAULT_WHATSAPP_TEMPLATE} onChange={(e) => set("whatsapp_template", e.target.value)} className="font-mono text-xs" />
                </Field>
                <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  {TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                    <div key={placeholder.key} className="flex gap-2">
                      <dt className="font-mono text-foreground">{`{${placeholder.key}}`}</dt>
                      <dd className="text-muted-foreground">{placeholder.description}</dd>
                    </div>
                  ))}
                </dl>
                <div>
                  <p className="mb-1 text-sm font-medium">Preview</p>
                  <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-sans text-sm">{preview}</pre>
                  <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => set("whatsapp_template", "")}>
                    Use the standard wording
                  </Button>
                </div>
              </Section>

              <div className="sticky bottom-0 -mx-1 flex justify-end border-t bg-background px-1 py-3">
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                  Save settings
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      )}
    </AdminShell>
  );
}
