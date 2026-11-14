"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { OutletMultiSelect } from "@/components/admin-menu/outlet-multi-select";
import { toBranch, type Branch } from "@/components/admin-branches/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getAdminOutlets } from "@/hooks/useAdminAccess";
import { useDocumentTypes } from "@/hooks/useDocumentTypes";
import { apiPost } from "@/lib/apiClient";
import {
  DOCUMENT_LABEL,
  defaultsFor,
  type DocumentKind,
  INVOICE_FIELD_GROUPS,
  INVOICE_LIMITS,
  LINE_MM,
  MAX_EMPTY_LINES,
  SPACERS,
  type SpacerKey,
  PAPER_SIZES,
  invoiceSetsError,
  normaliseInvoiceSets,
  type InvoiceSettings,
  type InvoiceSettingSet,
  type InvoiceShow,
  type PaperSize,
} from "@/lib/invoice-settings";
import { InvoicePreview } from "./invoice-preview";

const KEY = ["invoice-settings"];
const keyFor = (kind: DocumentKind) => (kind === "bill" ? ["bill-settings"] : KEY);


const withEveryBranch = (sets: InvoiceSettingSet[], defaults: InvoiceSettings): InvoiceSettingSet[] => {
  const all = sets.find((set) => set.outlets.length === 0) ?? { outlets: [], settings: defaults };
  return [all, ...sets.filter((set) => set.outlets.length > 0)];
};

/** A whole number of empty lines (or millimetres), with minus and plus buttons. */
function Stepper({ id, label, value, max, unit, hint, disabled, onChange }: { id: string; label: string; value: number; max: number; unit: string; hint?: string; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={disabled || value <= 0} aria-label={`Fewer: ${label}`} onClick={() => onChange(Math.max(0, value - 1))}><Minus className="h-3.5 w-3.5" aria-hidden /></Button>
        <span id={id} className="w-16 text-center text-sm tabular-nums" aria-live="polite">{value} {unit}</span>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={disabled || value >= max} aria-label={`More: ${label}`} onClick={() => onChange(Math.min(max, value + 1))}><Plus className="h-3.5 w-3.5" aria-hidden /></Button>
      </div>
    </div>
  );
}

function Slider({ id, label, value, range, unit, onChange }: { id: string; label: string; value: number; range: readonly [number, number]; unit: string; onChange: (value: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <span className="text-sm tabular-nums text-muted-foreground">{value} {unit}</span>
      </div>
      <input id={id} type="range" min={range[0]} max={range[1]} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
    </div>
  );
}

/** What the printed invoice shows, set for every branch or for chosen ones, with a preview of the printed sheet. */
export function InvoicePanel({ kind = "invoice" }: { kind?: DocumentKind }) {
  const defaults = defaultsFor(kind);
  const label = DOCUMENT_LABEL[kind];
  const queryClient = useQueryClient();
  const canEdit = getAdminOutlets().includes("all");
  const [sets, setSets] = useState<InvoiceSettingSet[]>([]);
  const documentTypes = useDocumentTypes();
  // The sample guests in each set's preview: how many, and which ID each holds.
  const [samples, setSamples] = useState<Array<{ guests: number; docs: string[] }>>([]);

  const query = useQuery({
    queryKey: keyFor(kind),
    queryFn: () => apiPost<{ invoice_setting_sets?: unknown; bill_setting_sets?: unknown }>("/admin/config", { action: "get" }, true),
    select: (data) => withEveryBranch(normaliseInvoiceSets(kind === "bill" ? data?.bill_setting_sets : data?.invoice_setting_sets, defaults), defaults),
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
    if (query.data) setSets(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => apiPost("/admin/config", { action: "update_invoice_settings", kind, invoice_setting_sets: sets }, true),
    onSuccess: () => {
      toast.success(`${label.name} settings saved`);
      void queryClient.invalidateQueries({ queryKey: keyFor(kind) });
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : `Could not save the ${label.name.toLowerCase()} settings`),
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError) return <p role="alert" className="text-sm text-destructive">{label.name} settings could not be loaded.</p>;

  const names = new Map((branches.data ?? []).map((b) => [b.location_key, b.name || b.location_key]));
  const patch = (index: number, change: Partial<InvoiceSettingSet>) => setSets((prev) => prev.map((set, i) => (i === index ? { ...set, ...change } : set)));
  const patchSettings = (index: number, change: Partial<InvoiceSettings>) => setSets((prev) => prev.map((set, i) => (i === index ? { ...set, settings: { ...set.settings, ...change } } : set)));
  const setShow = (index: number, key: keyof InvoiceShow, value: boolean) => setSets((prev) => prev.map((set, i) => (i === index ? { ...set, settings: { ...set.settings, show: { ...set.settings.show, [key]: value } } } : set)));
  const setSpacer = (index: number, key: SpacerKey, lines: number) => setSets((prev) => prev.map((set, i) => (i === index ? { ...set, settings: { ...set.settings, spacers: { ...set.settings.spacers, [key]: lines } } } : set)));
  // Which kinds of ID print (one choice for all of them), and whether all of their photos print or only the first.
  const printedTypes = (set: InvoiceSettingSet) => documentTypes.filter((t) => set.settings.documents[t.value]?.show !== false).map((t) => t.value);
  const photoMode = (set: InvoiceSettingSet): "all" | "first" =>
    documentTypes.some((t) => t.photos.length > 1 && set.settings.documents[t.value]?.show !== false && set.settings.documents[t.value]?.sides?.[1] === false) ? "first" : "all";
  const setDocuments = (index: number, shown: string[], mode: "all" | "first") =>
    setSets((prev) => prev.map((set, i) => {
      if (i !== index) return set;
      const documents = { ...set.settings.documents };
      for (const t of documentTypes) {
        // "All photos" is stored as no restriction; "first photo" leaves out every photo after the first.
        documents[t.value] = { show: shown.includes(t.value), sides: mode === "first" ? t.photos.map((_, n) => n === 0) : [] };
      }
      return { ...set, settings: { ...set.settings, documents } };
    }));
  const setSample = (index: number, change: Partial<{ guests: number; docs: string[] }>) =>
    setSamples((prev) => {
      const next = [...prev];
      next[index] = { guests: 2, docs: [], ...next[index], ...change };
      return next;
    });
  const sampleDocument = (index: number, guest: number) => samples[index]?.docs[guest] ?? documentTypes[guest % Math.max(documentTypes.length, 1)]?.value ?? "";
  const setSampleDocument = (index: number, guest: number, value: string) => {
    const count = samples[index]?.guests ?? 2;
    const docs = Array.from({ length: count }, (_, g) => sampleDocument(index, g));
    docs[guest] = value;
    setSample(index, { docs });
  };
  const taken = (index: number) => new Set(sets.flatMap((set, i) => (i === index ? [] : set.outlets)));
  const emptyScope = sets.some((set, i) => i > 0 && set.outlets.length === 0);
  const problem = emptyScope ? "Choose at least one branch for each extra set." : invoiceSetsError(sets, Array.from(names.keys()));
  const dirty = JSON.stringify(sets) !== JSON.stringify(query.data);

  // The issuer shown in the preview: the first branch the set covers (any branch for the every-branch set).
  const issuerFor = (set: InvoiceSettingSet) => {
    const branch = (branches.data ?? []).find((b) => (set.outlets.length ? set.outlets.includes(b.location_key) : true)) ?? branches.data?.[0];
    return {
      legal_name: branch?.legal_name || branch?.name || "Your branch",
      gstin: branch?.gstin ?? "",
      address: branch?.invoice_address || branch?.address || "Branch address",
      phone: branch?.invoice_phone || branch?.contact_number || "",
      email: branch?.invoice_email || branch?.contact_email || "",
      terms: branch?.invoice_terms ?? "",
    };
  };

  return (
    <form
      className="max-w-7xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (problem) return toast.error(problem);
        save.mutate();
      }}
    >
      <div>
        <h2 className="text-lg">{label.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose what the {label.name.toLowerCase()} shows, the paper it prints on and how big the photos are. The first set applies to every branch; add another set to give chosen branches their own. The preview shows the printed sheet, so you can try different numbers of guests.
        </p>
      </div>

      {sets.map((set, index) => (
        <section key={index} className="space-y-5 rounded-md border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-medium">{index === 0 ? "Every branch" : `Chosen branches: ${set.outlets.map((key) => names.get(key) ?? key).join(", ") || "none yet"}`}</h3>
              <p className="text-xs text-muted-foreground">{index === 0 ? "Used by any branch with no set of its own, including branches added later." : "Used by these branches instead of the every-branch settings."}</p>
            </div>
            {canEdit && index > 0 ? (
              <Button type="button" variant="ghost" size="icon" aria-label="Remove this set" onClick={() => { setSets((prev) => prev.filter((_, i) => i !== index)); }}>
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

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
            <div className="min-w-0 space-y-6">
              <h4 className="eyebrow -mb-3">Page and photo sizes</h4>
              <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor={`paper-${index}`} className="text-sm font-medium">Paper size</label>
                  <Select value={set.settings.paper} onValueChange={(paper) => patchSettings(index, { paper: paper as PaperSize })}>
                    <SelectTrigger id={`paper-${index}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(PAPER_SIZES) as PaperSize[]).map((key) => <SelectItem key={key} value={key}>{PAPER_SIZES[key].label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`perrow-${index}`} className="text-sm font-medium">Guests side by side</label>
                  <Select value={String(set.settings.guests_per_row)} onValueChange={(v) => patchSettings(index, { guests_per_row: Number(v) as 1 | 2 | 3 })}>
                    <SelectTrigger id={`perrow-${index}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n} per row</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Slider id={`margin-${index}`} label="Page margin" value={set.settings.margin_mm} range={INVOICE_LIMITS.margin_mm} unit="mm" onChange={(margin_mm) => patchSettings(index, { margin_mm })} />
                <Slider id={`idh-${index}`} label="ID photo height" value={set.settings.id_photo_height_mm} range={INVOICE_LIMITS.id_photo_height_mm} unit="mm" onChange={(id_photo_height_mm) => patchSettings(index, { id_photo_height_mm })} />
                <Slider id={`sigh-${index}`} label="Signature height" value={set.settings.signature_height_mm} range={INVOICE_LIMITS.signature_height_mm} unit="mm" onChange={(signature_height_mm) => patchSettings(index, { signature_height_mm })} />
              </fieldset>

              {INVOICE_FIELD_GROUPS.map((group) => {
                const spacer = SPACERS.find((candidate) => candidate.key === group.spacer);
                const isVerification = group.title === "Guests and verification";
                const show = set.settings.show;
                // Whether the section prints: its own switch, or (for sections made of several fields) any one of them.
                const enabled = group.master ? show[group.master] : group.all ? group.fields.some((field) => show[field.key]) : true;
                const sample = samples[index] ?? { guests: 2, docs: [] };
                const switchSection = (on: boolean) => {
                  if (group.master) setShow(index, group.master, on);
                  else for (const field of group.fields) setShow(index, field.key, on);
                };
                return (
                  <section key={group.title} className="rounded-md border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="eyebrow">{group.title}</h4>
                      {group.master || group.all ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{enabled ? "Shown" : "Hidden"}</span>
                          <Switch aria-label={`Show the ${group.title.toLowerCase()} section`} checked={enabled} disabled={!canEdit} onCheckedChange={switchSection} />
                        </div>
                      ) : null}
                    </div>

                    {enabled && group.fields.length > 0 ? (
                      <ul className="mt-2 divide-y divide-border">
                        {group.fields.map((field) => (
                          <li key={field.key} className="flex items-center justify-between gap-4 py-2.5">
                            <div>
                              <label htmlFor={`inv-${index}-${field.key}`} className="text-sm font-medium">{field.label}</label>
                              <p className="text-xs text-muted-foreground">{field.hint}</p>
                            </div>
                            <Switch id={`inv-${index}-${field.key}`} checked={show[field.key]} disabled={!canEdit} onCheckedChange={(value) => setShow(index, field.key, value)} />
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {isVerification && enabled ? (
                      <div className="mt-3 space-y-3 border-t border-border pt-3">
                        <div>
                          <p className="text-sm font-medium">Kinds of ID to print</p>
                          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Kinds of ID to print">
                            {documentTypes.map((type) => {
                              const on = printedTypes(set).includes(type.value);
                              return (
                                <button
                                  key={type.value}
                                  type="button"
                                  aria-pressed={on}
                                  disabled={!canEdit}
                                  onClick={() => setDocuments(index, on ? printedTypes(set).filter((v) => v !== type.value) : [...printedTypes(set), type.value], photoMode(set))}
                                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-50 ${on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                                >
                                  <Check className={`h-3.5 w-3.5 ${on ? "" : "invisible"}`} aria-hidden />
                                  {type.label}
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <label htmlFor={`docphotos-${index}`} className="text-sm font-medium">Photos to print for each</label>
                            <Select value={photoMode(set)} onValueChange={(mode) => setDocuments(index, printedTypes(set), mode as "all" | "first")} disabled={!canEdit}>
                              <SelectTrigger id={`docphotos-${index}`} className="w-56"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All photos (front and back)</SelectItem>
                                <SelectItem value="first">Only the first photo (front)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="rounded-md bg-muted/40 px-3 py-2">
                          <p className="text-sm font-medium">Sample guests in the preview</p>
                          <p className="text-xs text-muted-foreground">Choose how many guests the sample has and which ID each one holds, to see how the section fills the page.</p>
                          <Stepper id={`sample-count-${index}`} label="Number of guests" value={sample.guests} max={12} unit={sample.guests === 1 ? "guest" : "guests"} onChange={(count) => setSample(index, { guests: Math.max(1, count) })} />
                          <div className="grid gap-2 sm:grid-cols-2">
                            {Array.from({ length: sample.guests }, (_, guest) => (
                              <div key={guest} className="flex items-center gap-2">
                                <label htmlFor={`sample-doc-${index}-${guest}`} className="w-16 shrink-0 text-xs text-muted-foreground">Guest {guest + 1}</label>
                                <Select value={sampleDocument(index, guest)} onValueChange={(value) => setSampleDocument(index, guest, value)}>
                                  <SelectTrigger id={`sample-doc-${index}-${guest}`} className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>{documentTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {spacer || isVerification ? (
                      <div className="mt-3 divide-y divide-border rounded-md bg-muted/40 px-3 py-1">
                        {spacer ? (
                          <Stepper id={`gap-${index}-${spacer.key}`} label={`Empty lines after ${group.title.toLowerCase()}`} hint={`One line is ${LINE_MM} mm, up to ${MAX_EMPTY_LINES}.`} value={set.settings.spacers[spacer.key]} max={MAX_EMPTY_LINES} unit={set.settings.spacers[spacer.key] === 1 ? "line" : "lines"} disabled={!canEdit} onChange={(lines) => setSpacer(index, spacer.key, lines)} />
                        ) : null}
                        {isVerification && enabled ? (
                          <>
                            <Stepper id={`gap-${index}-photos`} label="Between a guest's photos" value={set.settings.photo_gap_lines} max={INVOICE_LIMITS.photo_gap_lines[1]} unit={set.settings.photo_gap_lines === 1 ? "line" : "lines"} disabled={!canEdit} onChange={(photo_gap_lines) => patchSettings(index, { photo_gap_lines })} />
                            <Stepper id={`gap-${index}-rows`} label="Between rows of guests" value={set.settings.guest_row_gap_lines} max={INVOICE_LIMITS.guest_row_gap_lines[1]} unit={set.settings.guest_row_gap_lines === 1 ? "line" : "lines"} disabled={!canEdit} onChange={(guest_row_gap_lines) => patchSettings(index, { guest_row_gap_lines })} />
                            <Stepper id={`gap-${index}-cols`} label="Between guests side by side" hint="Space between the columns of documents." value={set.settings.guest_column_gap_mm} max={INVOICE_LIMITS.guest_column_gap_mm[1]} unit="mm" disabled={!canEdit} onChange={(guest_column_gap_mm) => patchSettings(index, { guest_column_gap_mm })} />
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>

            {/* The printed sheet, always beside the settings and following them as they change. */}
            <div className="relative min-w-0 xl:sticky xl:top-4">
              <h4 className="mb-2 text-sm font-medium">Preview of the printed sheet</h4>
              <InvoicePreview kind={kind} settings={set.settings} issuer={issuerFor(set)} guests={samples[index]?.guests ?? 2} documentFor={Array.from({ length: samples[index]?.guests ?? 2 }, (_, g) => sampleDocument(index, g))} />
            </div>
          </div>
        </section>
      ))}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => setSets((prev) => [...prev, { outlets: [], settings: prev[0]?.settings ?? defaults }])}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Add settings for chosen branches
          </Button>
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}Save invoice settings
          </Button>
          {problem && dirty ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
        </div>
      ) : <p className="text-sm text-muted-foreground">Only an all-branch administrator can change these settings.</p>}
    </form>
  );
}
