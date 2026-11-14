"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Plus, Shirt, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { formatINR } from "@/components/admin/format";
import { useOutletsQuery } from "@/components/admin-bookings/use-bookings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getAdminOutlets, getAdminScopes, hasOutletAccess } from "@/hooks/useAdminAccess";
import { apiPost } from "@/lib/apiClient";

type Row = Record<string, any>;
const call = <T = Row,>(body: Row) => apiPost<T>("/admin/laundry", body, true);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const day = (value: string) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const KEYS = { batches: ["laundry", "batches"], items: ["laundry", "items"], missing: ["laundry", "missing"], vendors: ["laundry", "vendors"], stock: ["laundry", "stock"], window: ["laundry", "window"] };
const NONE = "__none__";
const RULES: Array<[string, string]> = [["FIRST", "1st of every month"], ["LAST", "Last day of every month"], ["DAY", "A fixed day of the month"]];

const STATUS: Record<string, [string, string]> = {
  SENT: ["With the laundry", "border-amber-500/50 bg-amber-500/10 text-amber-600"],
  PARTIAL: ["Part received", "border-amber-500/50 bg-amber-500/10 text-amber-600"],
  RECEIVED: ["All received", "border-green-600/40 bg-green-600/10 text-green-600"],
  SETTLED: ["Settled", "border-border bg-muted text-muted-foreground"],
};
function StatusBadge({ status }: { status: string }) {
  const [label, tone] = STATUS[status] ?? [status, ""];
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}

const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const num = "px-3 py-2 text-right tabular-nums";

/** The price in effect on a day, from an item's history (newest first); falls back to its current price. */
const priceOn = (item: Row, date: string): number => {
  const hit = (item.history ?? []).find((h: Row) => h.from <= date);
  return hit ? hit.price : item.price;
};

function useWindow() {
  return useQuery({ queryKey: KEYS.window, queryFn: () => call<{ window: Row }>({ action: "settings" }), select: (d) => d.window, staleTime: 30_000 });
}

function useVendors() {
  return useQuery({ queryKey: KEYS.vendors, queryFn: () => call<{ vendors: Row[] }>({ action: "vendors" }), select: (d) => d.vendors, staleTime: 30_000 });
}

function useItems() {
  return useQuery({ queryKey: KEYS.items, queryFn: () => call<{ items: Row[] }>({ action: "items" }), select: (d) => d.items, staleTime: 30_000 });
}

/* ---------------------------------------------------------------- give laundry */
function BatchFormDialog({ open, onClose, editing, items, outlets, onDone }: { open: boolean; onClose: () => void; editing: Row | null; items: Row[]; outlets: Array<{ location_key: string; name?: string }>; onDone: (batch: Row) => void }) {
  const [date, setDate] = useState(editing?.date ?? today());
  const [outlet, setOutlet] = useState(editing?.outlet_id ?? (outlets.length === 1 ? outlets[0].location_key : ""));
  const vendors = (useVendors().data ?? []).filter((v) => v.active || v.name === editing?.vendor);
  const [vendor, setVendor] = useState(editing?.vendor ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries((editing?.lines ?? []).map((l: Row) => [l.item_id, String(l.sent_qty)])));
  // Each item is priced at the rate in effect on the date given.
  const rows = useMemo(() => {
    const own = new Map<string, Row>((editing?.lines ?? []).map((l: Row) => [l.item_id, { id: l.item_id, name: l.name, price: l.unit_price }]));
    const list: Row[] = items.filter((i) => i.active || own.has(i.id)).map((i): Row => ({ ...i, price: priceOn(i, date) ?? own.get(i.id)?.price ?? i.price }));
    return list;
  }, [items, editing, date]);
  const total = rows.reduce((sum, r) => sum + (Number(qty[r.id]) || 0) * r.price, 0);
  const count = rows.reduce((sum, r) => sum + (Number(qty[r.id]) || 0), 0);
  const save = useMutation({
    mutationFn: () => call<{ batch: Row }>({ action: editing ? "update" : "create", id: editing?.id, outlet_id: outlet, date, vendor, notes, lines: rows.map((r) => ({ item_id: r.id, qty: Number(qty[r.id]) || 0 })).filter((l) => l.qty > 0) }),
    onSuccess: (d) => { toast.success(editing ? "Laundry updated" : "Laundry recorded"); onDone(d.batch); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit laundry sent" : "Give laundry"}</DialogTitle><DialogDescription>Enter how many of each item you are sending. The rate is the price in effect on the date given, from the Items and prices list.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="lg-date">Date given</label><Input id="lg-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required /></div>
            {outlets.length > 1 ? (
              <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="lg-branch">Branch</label>
                <Select value={outlet} onValueChange={setOutlet} disabled={Boolean(editing)}><SelectTrigger id="lg-branch"><SelectValue placeholder="Choose branch" /></SelectTrigger><SelectContent>{outlets.map((o) => <SelectItem key={o.location_key} value={o.location_key}>{o.name ?? o.location_key}</SelectItem>)}</SelectContent></Select></div>
            ) : null}
            <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="lg-vendor">Laundry / vendor <span className="font-normal text-muted-foreground">(optional)</span></label>
              {vendors.length > 0 ? <Select value={vendor || NONE} onValueChange={(v) => setVendor(v === NONE ? "" : v)}><SelectTrigger id="lg-vendor"><SelectValue placeholder="Choose laundry" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Not specified</SelectItem>{vendors.map((v) => <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>)}</SelectContent></Select>
                : <Input id="lg-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />}</div>
            <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="lg-notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></label><Input id="lg-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">There are no laundry items yet. Add them on the Items and prices tab first.</p> : (
            <div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-sm"><thead className="border-b border-border"><tr><th className={th}>Item</th><th className={`${th} text-right`}>Rate</th><th className={`${th} w-28 text-right`}>Sent</th><th className={`${th} text-right`}>Amount</th></tr></thead>
              <tbody className="divide-y divide-border">{rows.map((r) => <tr key={r.id}><td className="px-3 py-2">{r.name}</td><td className={num}>{formatINR(r.price)}</td>
                <td className="px-3 py-1.5"><Input type="number" min={0} inputMode="numeric" aria-label={`${r.name} sent`} className="h-8 text-right" value={qty[r.id] ?? ""} onChange={(e) => setQty({ ...qty, [r.id]: e.target.value })} /></td>
                <td className={num}>{formatINR((Number(qty[r.id]) || 0) * r.price)}</td></tr>)}</tbody>
              <tfoot className="border-t border-border font-medium"><tr><td className="px-3 py-2" colSpan={2}>Total</td><td className={num}>{count}</td><td className={num}>{formatINR(total)}</td></tr></tfoot></table></div>
          )}
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.isPending || count === 0 || !outlet}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}{editing ? "Save changes" : "Record laundry given"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- settle (overall) */
function SettleDialog({ draft, vendor, onClose, onDone }: { draft: Row; vendor: string; onClose: () => void; onDone: () => void }) {
  const [adjust, setAdjust] = useState<Record<string, string>>({});
  const [overall, setOverall] = useState("");
  const [mode, setMode] = useState("CASH");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const items: Row[] = draft.items.filter((i: Row) => i.received_qty > 0 || i.missing_qty > 0);
  const t = draft.totals;
  const itemAdj = items.reduce((s, l) => s + (Number(adjust[l.item_id]) || 0), 0);
  const net = Math.round((t.received_amount - itemAdj - (Number(overall) || 0)) * 100) / 100;
  const settle = useMutation({
    mutationFn: () => call({ action: "settle_all", vendor: vendor || undefined, adjustments: items.map((l) => ({ item_id: l.item_id, amount: Number(adjust[l.item_id]) || 0 })), adjustment: Number(overall) || 0, note, payment: { mode, reference } }),
    onSuccess: () => { toast.success("Laundry settled"); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not settle"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Settle laundry{draft.from ? `: ${day(draft.from)}${draft.to !== draft.from ? ` to ${day(draft.to)}` : ""}` : ""}</DialogTitle><DialogDescription>One settlement for everything that came back, added up by item. Each day is priced at the rate that applied on that day. You can reduce the amount for an item or for the whole bill.</DialogDescription></DialogHeader>
        <div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-sm"><thead className="border-b border-border"><tr><th className={th}>Item</th><th className={`${th} text-right`}>Given</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Still out</th><th className={`${th} text-right`}>Amount</th><th className={`${th} w-28 text-right`}>Reduce by (₹)</th></tr></thead>
          <tbody className="divide-y divide-border">{items.map((l) => <tr key={l.item_id}><td className="px-3 py-2">{l.name}</td><td className={num}>{l.sent_qty}</td><td className={num}>{l.received_qty}</td><td className={`${num} ${l.missing_qty ? "font-medium text-destructive" : ""}`}>{l.missing_qty}</td><td className={num}>{formatINR(l.received_amount)}</td>
            <td className="px-3 py-1.5"><Input type="number" min={0} step="0.01" inputMode="decimal" aria-label={`Reduce ${l.name}`} className="h-8 text-right" value={adjust[l.item_id] ?? ""} onChange={(e) => setAdjust({ ...adjust, [l.item_id]: e.target.value })} /></td></tr>)}</tbody></table></div>
        <dl className="ml-auto w-full max-w-sm space-y-1 text-sm">
          <div className="flex justify-between font-medium"><dt>For what came back ({t.received_qty} items)</dt><dd className="tabular-nums">{formatINR(t.received_amount)}</dd></div>
          {itemAdj > 0 ? <div className="flex justify-between"><dt className="text-muted-foreground">Reduced for items</dt><dd className="tabular-nums">−{formatINR(itemAdj)}</dd></div> : null}
          <div className="flex items-center justify-between gap-3"><dt><label htmlFor="overall-adj" className="text-muted-foreground">Reduce the total by (₹)</label></dt><dd><Input id="overall-adj" type="number" min={0} step="0.01" inputMode="decimal" className="h-8 w-28 text-right" value={overall} onChange={(e) => setOverall(e.target.value)} /></dd></div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>To pay</dt><dd className="tabular-nums">{formatINR(net)}</dd></div>
        </dl>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="pay-mode">Paid by</label><Select value={mode} onValueChange={setMode}><SelectTrigger id="pay-mode"><SelectValue /></SelectTrigger><SelectContent>{["CASH", "UPI", "BANK", "OTHER"].map((m) => <SelectItem key={m} value={m}>{m === "BANK" ? "Bank transfer" : m.charAt(0) + m.slice(1).toLowerCase()}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="pay-ref">Reference <span className="font-normal text-muted-foreground">(optional)</span></label><Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-3"><label className="text-sm font-medium" htmlFor="pay-note">Reason for any reduction, or a note</label><Textarea id="pay-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: agreed ₹50 off" /></div>
        </div>
        {t.missing_qty > 0 ? <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t.missing_qty} item{t.missing_qty === 1 ? " is" : "s are"} still out (worth {formatINR(t.missing_amount)}) from these laundry records. They are not charged. They stay in the Missing items list as written off.</p> : null}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => settle.mutate()} disabled={settle.isPending || net < 0}>{settle.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}Settle {formatINR(net)}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- one batch */
function BatchDialog({ id, onClose, items, outlets, isAdmin }: { id: string; onClose: () => void; items: Row[]; outlets: any[]; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["laundry", "batch", id], queryFn: () => call<{ batch: Row }>({ action: "get", id }), select: (d) => d.batch });
  const batch = query.data;
  const [receiveDate, setReceiveDate] = useState(today());
  const [got, setGot] = useState<Record<string, string>>({});
  const [receiveNote, setReceiveNote] = useState("");
  const [editing, setEditing] = useState(false);
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["laundry"] }); };
  const receive = useMutation({
    mutationFn: () => call({ action: "receive", id, date: receiveDate, note: receiveNote, lines: Object.entries(got).map(([item_id, qty]) => ({ item_id, qty: Number(qty) || 0 })).filter((l) => l.qty > 0) }),
    onSuccess: () => { toast.success("Received laundry recorded"); setGot({}); setReceiveNote(""); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record"),
  });
  const undo = useMutation({ mutationFn: (receipt_id: string) => call({ action: "undo_receipt", id, receipt_id }), onSuccess: () => { toast.success("Receipt removed"); refresh(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove") });
  const remove = useMutation({ mutationFn: () => call({ action: "delete", id }), onSuccess: () => { toast.success("Laundry record deleted"); refresh(); onClose(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete") });
  const t = batch?.totals;
  const settled = batch?.status === "SETTLED";
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          {!batch ? <div className="space-y-3 p-2"><DialogTitle>Laundry</DialogTitle><Skeleton className="h-40 w-full" /></div> : (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-3">Laundry given {day(batch.date)} <StatusBadge status={batch.status} /></DialogTitle>
                <DialogDescription>{[batch.vendor, batch.outlet_id, batch.created_by ? `recorded by ${batch.created_by}` : ""].filter(Boolean).join(" · ")}{batch.notes ? ` · ${batch.notes}` : ""}</DialogDescription>
              </DialogHeader>

              <div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-sm"><thead className="border-b border-border"><tr><th className={th}>Item</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Sent</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Missing</th><th className={`${th} text-right`}>Sent ₹</th><th className={`${th} text-right`}>Received ₹</th></tr></thead>
                <tbody className="divide-y divide-border">{batch.lines.map((l: Row) => <tr key={l.item_id}><td className="px-3 py-2">{l.name}</td><td className={num}>{formatINR(l.unit_price)}</td><td className={num}>{l.sent_qty}</td><td className={num}>{l.received_qty}</td><td className={`${num} ${l.missing_qty ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{l.missing_qty || "—"}</td><td className={num}>{formatINR(l.sent_amount)}</td><td className={num}>{formatINR(l.received_amount)}</td></tr>)}</tbody>
                <tfoot className="border-t border-border font-medium"><tr><td className="px-3 py-2" colSpan={2}>Total</td><td className={num}>{t.sent_qty}</td><td className={num}>{t.received_qty}</td><td className={`${num} ${t.missing_qty ? "text-destructive" : ""}`}>{t.missing_qty || "—"}</td><td className={num}>{formatINR(t.sent_amount)}</td><td className={num}>{formatINR(t.received_amount)}</td></tr></tfoot></table></div>
              {t.missing_qty > 0 ? <p className="flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t.missing_qty} item{t.missing_qty === 1 ? "" : "s"} not received, worth {formatINR(t.missing_amount)}. {settled ? "Written off when settled, and kept on record." : "Tracked as missing until they come back."}</p> : null}

              {!settled && t.received_qty > 0 ? <p className="text-sm text-muted-foreground">This is settled together with the rest of the laundry, from the Out with laundry tab.</p> : null}

              {settled && batch.settlement ? (
                <section className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
                  <h3 className="flex items-center gap-2 font-display text-lg"><CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden />Settlement</h3>
                  <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-border"><tr><th className={th}>Item</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Amount</th><th className={`${th} text-right`}>Reduced</th><th className={`${th} text-right`}>Paid</th></tr></thead>
                    <tbody className="divide-y divide-border">{batch.settlement.items.map((i: Row) => <tr key={i.item_id}><td className="px-3 py-1.5">{i.name}{i.missing_qty ? <span className="ml-2 text-xs text-destructive">{i.missing_qty} missing</span> : null}</td><td className={num}>{i.received_qty}</td><td className={num}>{formatINR(i.unit_price)}</td><td className={num}>{formatINR(i.received_amount)}</td><td className={num}>{i.adjustment ? `−${formatINR(i.adjustment)}` : "—"}</td><td className={num}>{formatINR(i.net_amount)}</td></tr>)}</tbody></table></div>
                  <dl className="ml-auto w-full max-w-sm space-y-1 text-sm">
                    <div className="flex justify-between"><dt className="text-muted-foreground">Sent</dt><dd className="tabular-nums">{formatINR(batch.settlement.totals.sent_amount)}</dd></div>
                    <div className="flex justify-between text-destructive"><dt>Not received (not charged)</dt><dd className="tabular-nums">−{formatINR(batch.settlement.totals.missing_amount)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">For what came back</dt><dd className="tabular-nums">{formatINR(batch.settlement.totals.received_amount)}</dd></div>
                    {batch.settlement.totals.item_adjustments > 0 ? <div className="flex justify-between"><dt className="text-muted-foreground">Reduced for items</dt><dd className="tabular-nums">−{formatINR(batch.settlement.totals.item_adjustments)}</dd></div> : null}
                    {batch.settlement.totals.overall_adjustment > 0 ? <div className="flex justify-between"><dt className="text-muted-foreground">Reduced from the total</dt><dd className="tabular-nums">−{formatINR(batch.settlement.totals.overall_adjustment)}</dd></div> : null}
                    <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold"><dt>Paid</dt><dd className="tabular-nums">{formatINR(batch.settlement.totals.net_payable)}</dd></div>
                  </dl>
                  <p className="text-xs text-muted-foreground">Settled {new Date(batch.settlement.at).toLocaleString()} by {batch.settlement.by} · {batch.settlement.payment?.mode}{batch.settlement.payment?.reference ? ` (${batch.settlement.payment.reference})` : ""}{batch.settlement.note ? ` · ${batch.settlement.note}` : ""}</p>
                </section>
              ) : (
                <>
                  {t.missing_qty > 0 ? (
                    <section className="space-y-3 rounded-md border border-border p-4">
                      <h3 className="font-display text-lg">Record laundry received</h3>
                      <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="rc-date">Date received</label><Input id="rc-date" type="date" max={today()} value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} /></div>
                        <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium" htmlFor="rc-note">Note <span className="font-normal text-muted-foreground">(optional)</span></label><Input id="rc-note" value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} /></div></div>
                      <div className="grid gap-2 sm:grid-cols-2">{batch.lines.filter((l: Row) => l.missing_qty > 0).map((l: Row) => <div key={l.item_id} className="flex items-center gap-3"><label htmlFor={`rc-${l.item_id}`} className="min-w-0 flex-1 text-sm">{l.name} <span className="text-xs text-muted-foreground">({l.missing_qty} still out)</span></label><Input id={`rc-${l.item_id}`} type="number" min={0} max={l.missing_qty} inputMode="numeric" className="h-8 w-24 text-right" value={got[l.item_id] ?? ""} onChange={(e) => setGot({ ...got, [l.item_id]: e.target.value })} /></div>)}</div>
                      <div className="flex flex-wrap gap-2"><Button onClick={() => receive.mutate()} disabled={receive.isPending || !Object.values(got).some((v) => Number(v) > 0)}>{receive.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}Add received</Button>
                        <Button type="button" variant="outline" onClick={() => setGot(Object.fromEntries(batch.lines.filter((l: Row) => l.missing_qty > 0).map((l: Row) => [l.item_id, String(l.missing_qty)])))}>Everything came back</Button></div>
                    </section>
                  ) : null}
                </>
              )}

              {batch.receipts.length > 0 ? (
                <section className="space-y-2"><h3 className="font-display text-lg">Received on</h3>
                  <ul className="divide-y divide-border rounded-md border border-border text-sm">{batch.receipts.map((r: Row) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"><span><strong>{day(r.date)}</strong>: {r.lines.map((l: Row) => `${l.qty} ${l.name}`).join(", ")}{r.note ? <span className="text-muted-foreground"> · {r.note}</span> : null}<span className="ml-2 text-xs text-muted-foreground">by {r.by}</span></span>{!settled ? <Button type="button" variant="ghost" size="sm" onClick={() => undo.mutate(r.id)} disabled={undo.isPending}><Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />Undo</Button> : null}</li>)}</ul></section>
              ) : null}

              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                <div className="flex gap-2">{!settled && batch.receipts.length === 0 ? <Button type="button" variant="outline" onClick={() => setEditing(true)}>Edit items</Button> : null}
                  {isAdmin && !settled && batch.receipts.length === 0 ? <Button type="button" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm("Delete this laundry record?")) remove.mutate(); }}><Trash2 className="mr-1.5 h-4 w-4" aria-hidden />Delete</Button> : null}</div>
                <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Close</Button></div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {editing && batch ? <BatchFormDialog open editing={batch} items={items} outlets={outlets} onClose={() => setEditing(false)} onDone={() => { setEditing(false); refresh(); }} /> : null}
    </>
  );
}

/* ---------------------------------------------------------------- tabs */
function Batches({ items, outlets, isAdmin }: { items: Row[]; outlets: any[]; isAdmin: boolean }) {
  const [status, setStatus] = useState("OPEN");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: [...KEYS.batches, status], queryFn: () => call<{ batches: Row[]; summary: Row; window: Row }>({ action: "list", status: status === "ALL" ? undefined : status }) });
  const summary = query.data?.summary;
  const schedule: Row | undefined = query.data?.window;
  return (
    <div className="space-y-4">
      {schedule ? <p className={`flex items-start gap-2 rounded-md p-3 text-sm ${schedule.open ? "bg-green-600/10 text-green-700" : "bg-amber-500/10 text-amber-700"}`}><CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{schedule.restrict ? (schedule.open ? "Today is a settlement day. You can settle now." : `Settlement is on ${schedule.summary}. Next: ${day(schedule.next_date)}.`) : "Laundry can be settled on any day."} Records stay in the current list until they are settled{summary?.from ? ` (oldest is from ${day(summary.from)})` : ""}.</p> : null}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {([["Not settled yet", summary?.unsettled ?? "–"], ["To pay (not settled)", summary ? formatINR(summary.to_pay) : "–"], ["With the laundry now", summary?.out_now ?? "–"], ["Ready to settle", summary?.to_settle ?? "–"], ["Items missing", summary?.missing_items ?? "–"], ["Worth", summary ? formatINR(summary.missing_value) : "–"]] as const).map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-2xl">{value}</p></div>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-52" aria-label="Show"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="OPEN">Current (not settled)</SelectItem><SelectItem value="ALL">All records</SelectItem>{Object.entries(STATUS).map(([k, [label]]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent></Select>
        <Button onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" aria-hidden />Give laundry</Button>
      </div>
      {query.isLoading ? <Skeleton className="h-40 w-full" /> : (query.data?.batches ?? []).length === 0 ? <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{status === "OPEN" ? "Nothing is waiting to be settled." : "No laundry recorded yet."} Press "Give laundry" when you send a batch out.</p> : (
        <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm"><thead className="border-b border-border bg-muted/40"><tr><th className={th}>Given</th><th className={th}>Branch</th><th className={th}>Vendor</th><th className={`${th} text-right`}>Sent</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Missing</th><th className={`${th} text-right`}>Value</th><th className={th}>Status</th></tr></thead>
          <tbody className="divide-y divide-border">{query.data!.batches.map((b) => <tr key={b.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(b.id)}><td className="px-3 py-2.5 font-medium">{day(b.date)}</td><td className="px-3 py-2.5">{b.outlet_id}</td><td className="px-3 py-2.5">{b.vendor || "—"}</td><td className={num}>{b.totals.sent_qty}</td><td className={num}>{b.totals.received_qty}</td><td className={`${num} ${b.totals.missing_qty ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{b.totals.missing_qty || "—"}</td><td className={num}>{formatINR(b.settlement ? b.settlement.totals.net_payable : b.totals.received_amount)}</td><td className="px-3 py-2.5"><StatusBadge status={b.status} /></td></tr>)}</tbody></table></div>
      )}
      <p className="text-xs text-muted-foreground">Click a row to see what was sent and received. The value shows what was paid once settled; before that, the worth of what has come back, each day at the price that applied on that day.</p>
      {open ? <BatchDialog id={open} items={items} outlets={outlets} isAdmin={isAdmin} onClose={() => { setOpen(null); void queryClient.invalidateQueries({ queryKey: ["laundry"] }); }} /> : null}
      {creating ? <BatchFormDialog open editing={null} items={items} outlets={outlets} onClose={() => setCreating(false)} onDone={() => { setCreating(false); void queryClient.invalidateQueries({ queryKey: ["laundry"] }); toast.message("Find it under Out with laundry, or on the Laundry tab."); }} /> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- out with the laundry */
function OutNow() {
  const queryClient = useQueryClient();
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [got, setGot] = useState<Record<string, string>>({});
  const vendors = useVendors().data ?? [];
  const query = useQuery({ queryKey: [...KEYS.stock, vendor], queryFn: () => call<{ items: Row[]; totals: Row }>({ action: "stock", vendor: vendor || undefined }) });
  const receive = useMutation({
    mutationFn: () => call({ action: "receive_items", vendor: vendor || undefined, date, note, lines: Object.entries(got).map(([item_id, qty]) => ({ item_id, qty: Number(qty) || 0 })).filter((l) => l.qty > 0) }),
    onSuccess: () => { toast.success("Received laundry recorded"); setGot({}); setNote(""); void queryClient.invalidateQueries({ queryKey: ["laundry"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record"),
  });
  const d = query.data;
  const schedule = useWindow().data;
  const preview = useQuery({ queryKey: [...KEYS.stock, "preview", vendor], queryFn: () => call<{ draft: Row }>({ action: "settle_preview", vendor: vendor || undefined }), select: (r) => r.draft });
  const [settling, setSettling] = useState<Row | null>(null);
  if (query.isLoading) return <Skeleton className="h-40 w-full" />;
  const items = d?.items ?? [];
  const anyEntered = Object.values(got).some((v) => Number(v) > 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {([["Given to laundry", d?.totals.sent_qty ?? 0], ["Received back", d?.totals.received_qty ?? 0], ["Still out", d?.totals.out_qty ?? 0], ["Worth", formatINR(d?.totals.out_amount ?? 0)]] as const).map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-2xl">{value}</p></div>)}
      </div>
      <p className="text-sm text-muted-foreground">Everything given to the laundry that is not settled yet, added up by item. Enter how many of each came back and press Add received; it is counted against the oldest laundry first.</p>
      {vendors.length > 0 ? <Select value={vendor || NONE} onValueChange={(v) => setVendor(v === NONE ? "" : v)}><SelectTrigger className="w-60" aria-label="Laundry"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>All laundries</SelectItem>{vendors.map((v) => <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>)}</SelectContent></Select> : null}
      {items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nothing is with the laundry. Press "Give laundry" on the Laundry tab when you send a batch out.</p> : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm"><thead className="border-b border-border bg-muted/40"><tr><th className={th}>Item</th><th className={`${th} text-right`}>Given</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Still out</th><th className={`${th} text-right`}>Worth</th><th className={`${th} w-32 text-right`}>Received now</th></tr></thead>
            <tbody className="divide-y divide-border">{items.map((r) => (
              <>
                <tr key={r.item_id}><td className="px-3 py-2.5 font-medium">{r.name}</td><td className={num}>{r.sent_qty}</td><td className={num}>{r.received_qty}</td><td className={`${num} ${r.out_qty ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{r.out_qty || "—"}</td><td className={num}>{formatINR(r.out_amount)}</td>
                  <td className="px-3 py-1.5">{r.out_qty ? <Input type="number" min={0} max={r.out_qty} inputMode="numeric" aria-label={`${r.name} received now`} className="h-8 text-right" value={got[r.item_id] ?? ""} onChange={(e) => setGot({ ...got, [r.item_id]: e.target.value })} /> : null}</td></tr>
              </>))}</tbody></table></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="out-date">Date received</label><Input id="out-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium" htmlFor="out-note">Note <span className="font-normal text-muted-foreground">(optional)</span></label><Input id="out-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap gap-2"><Button onClick={() => receive.mutate()} disabled={receive.isPending || !anyEntered}>{receive.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}Add received</Button>
            <Button type="button" variant="outline" onClick={() => setGot(Object.fromEntries(items.filter((r) => r.out_qty > 0).map((r) => [r.item_id, String(r.out_qty)])))}>Everything came back</Button></div>
        </>
      )}

      <section className="space-y-3 border-t border-border pt-6">
        <h3 className="font-display text-lg">Settlement</h3>
        {preview.data && preview.data.count > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
            <div><p className="text-xs text-muted-foreground">To pay for everything received, {day(preview.data.from)}{preview.data.to !== preview.data.from ? ` to ${day(preview.data.to)}` : ""}</p><p className="font-display text-3xl">{formatINR(preview.data.totals.received_amount)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{preview.data.totals.received_qty} items received, each day at its own price.{schedule?.restrict ? ` Settlement is on ${schedule.summary}${schedule.open ? " (today)" : `; next: ${day(schedule.next_date)}`}.` : ""}</p></div>
            <Button onClick={() => setSettling(preview.data)} disabled={schedule ? !schedule.open : false} title={schedule && !schedule.open ? `Settlement is on ${schedule.summary}` : undefined}>Settle…</Button>
          </div>
        ) : <p className="text-sm text-muted-foreground">Nothing to settle yet. Record what came back above.</p>}
      </section>
      {settling ? <SettleDialog draft={settling} vendor={vendor} onClose={() => setSettling(null)} onDone={() => { setSettling(null); void queryClient.invalidateQueries({ queryKey: ["laundry"] }); }} /> : null}
    </div>
  );
}

function SettledTab() {
  const query = useQuery({ queryKey: ["laundry", "settlements"], queryFn: () => call<{ settlements: Row[] }>({ action: "settlements" }), select: (d) => d.settlements });
  if (query.isLoading) return <Skeleton className="h-40 w-full" />;
  const list = query.data ?? [];
  if (list.length === 0) return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No settlements yet.</p>;
  return (
    <div className="space-y-3">{list.map((r) => (
      <details key={r.id} className="rounded-lg border border-border bg-card p-4">
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3"><span className="font-medium">{day(r.from)}{r.to !== r.from ? ` to ${day(r.to)}` : ""}{r.vendor ? ` · ${r.vendor}` : ""}</span><span className="text-sm text-muted-foreground">Paid <strong className="text-foreground">{formatINR(r.totals.net_payable)}</strong> · settled {new Date(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} by {r.by}</span></summary>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-border"><tr><th className={th}>Item</th><th className={`${th} text-right`}>Given</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Still out</th><th className={`${th} text-right`}>Amount</th><th className={`${th} text-right`}>Reduced</th><th className={`${th} text-right`}>Paid</th></tr></thead>
          <tbody className="divide-y divide-border">{r.items.map((i: Row) => <tr key={i.item_id}><td className="px-3 py-1.5">{i.name}</td><td className={num}>{i.sent_qty}</td><td className={num}>{i.received_qty}</td><td className={num}>{i.missing_qty || "—"}</td><td className={num}>{formatINR(i.received_amount)}</td><td className={num}>{i.adjustment ? `−${formatINR(i.adjustment)}` : "—"}</td><td className={num}>{formatINR(i.net_amount)}</td></tr>)}</tbody></table></div>
        {r.totals.overall_adjustment > 0 ? <p className="mt-2 text-sm text-muted-foreground">Reduced from the total: −{formatINR(r.totals.overall_adjustment)}</p> : null}
        <p className="mt-2 text-xs text-muted-foreground">{r.batches} laundry record{r.batches === 1 ? "" : "s"} · {r.payment?.mode}{r.payment?.reference ? ` (${r.payment.reference})` : ""}{r.note ? ` · ${r.note}` : ""}</p>
      </details>))}</div>
  );
}

function Missing() {
  const [open, setOpen] = useState<string | null>(null);
  const query = useQuery({ queryKey: KEYS.missing, queryFn: () => call<{ by_item: Row[]; rows: Row[] }>({ action: "missing" }) });
  if (query.isLoading) return <Skeleton className="h-40 w-full" />;
  const d = query.data!;
  if (d.rows.length === 0) return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nothing is missing. Items that do not come back are listed here, and stay listed after the laundry is settled.</p>;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{d.by_item.map((i) => <div key={i.name} className="rounded-lg border border-border bg-card p-4"><p className="font-medium">{i.name}</p><p className="mt-1 text-sm"><span className="font-display text-xl text-destructive">{i.open_qty}</span> still out <span className="text-muted-foreground">({formatINR(i.open_amount)})</span></p>{i.written_off_qty ? <p className="text-xs text-muted-foreground">{i.written_off_qty} written off when settled ({formatINR(i.written_off_amount)})</p> : null}</div>)}</div>
      <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm"><thead className="border-b border-border bg-muted/40"><tr><th className={th}>Given</th><th className={th}>Item</th><th className={th}>Vendor</th><th className={`${th} text-right`}>Sent</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Missing</th><th className={`${th} text-right`}>Worth</th><th className={th}>State</th></tr></thead>
        <tbody className="divide-y divide-border">{d.rows.map((r, i) => <tr key={i} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(r.batch_id)}><td className="px-3 py-2.5">{day(r.date)}</td><td className="px-3 py-2.5 font-medium">{r.item}</td><td className="px-3 py-2.5">{r.vendor || "—"}</td><td className={num}>{r.sent_qty}</td><td className={num}>{r.received_qty}</td><td className={`${num} font-semibold text-destructive`}>{r.missing_qty}</td><td className={num}>{formatINR(r.missing_amount)}</td><td className="px-3 py-2.5">{r.state === "open" ? <span className="text-amber-600">Still out</span> : <span className="text-muted-foreground">Written off at settlement</span>}</td></tr>)}</tbody></table></div>
      {open ? <BatchDialog id={open} items={[]} outlets={[]} isAdmin={false} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function ItemsTab({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const query = useItems();
  const [list, setList] = useState<Row[] | null>(null);
  const rows = list ?? query.data ?? [];
  const [from, setFrom] = useState(today());
  const priceChanged = list !== null && list.some((r) => { const old = (query.data ?? []).find((o) => o.id === r.id); return !old || Number(old.price) !== Number(r.price); });
  const save = useMutation({
    mutationFn: () => call<{ items: Row[] }>({ action: "items_save", effective_from: from, items: rows.filter((r) => r.name.trim()).map(({ id, name, price, active }) => ({ id, name, price, active })) }),
    onSuccess: (d) => { toast.success("Items and prices saved"); setList(null); queryClient.setQueryData(KEYS.items, d); void queryClient.invalidateQueries({ queryKey: ["laundry"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });
  const set = (index: number, patch: Row) => setList(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  if (query.isLoading) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">The things that go to the laundry and what each costs. Prices are dated. Laundry is priced at the rate in effect on the day it was given: if bed sheets cost ₹7 on Monday and ₹10 from Tuesday, 10 given on Monday and 5 on Tuesday come to ₹70 + ₹50 = ₹120. A new price starts on the date you choose below; choose an earlier date to correct laundry that is not settled yet. Settled records never change. An item you remove is switched off, not deleted.</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {rows.length === 0 ? <li className="p-4 text-sm text-muted-foreground">No items yet.{canEdit ? " Add the first one below." : ""}</li> : null}
        {rows.map((r, i) => (
          <li key={r.id ?? `new-${i}`} className={`flex flex-wrap items-center gap-3 p-3 ${r.active === false ? "opacity-60" : ""}`}>
            <Input aria-label="Item name" className="min-w-0 flex-1" value={r.name} disabled={!canEdit} placeholder="Bed sheet" onChange={(e) => set(i, { name: e.target.value })} />
            <div className="flex items-center gap-1.5"><span className="text-sm text-muted-foreground">₹</span><Input aria-label={`Price of ${r.name || "item"}`} type="number" min={0} step="0.01" inputMode="decimal" className="w-24 text-right" value={r.price} disabled={!canEdit} onChange={(e) => set(i, { price: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={r.active !== false} disabled={!canEdit} onCheckedChange={(active) => set(i, { active })} aria-label={`${r.name || "Item"} in use`} />{r.active === false ? "Off" : "In use"}</label>
            {r.history && r.history.length > 1 ? <details className="w-full text-xs text-muted-foreground"><summary className="cursor-pointer">Price history</summary><ul className="mt-1 space-y-0.5">{r.history.map((h: Row) => <li key={h.from}>{h.from === "1970-01-01" ? "Before" : `From ${day(h.from)}`}: {formatINR(h.price)}</li>)}</ul></details> : null}
            {canEdit && !r.id ? <Button type="button" variant="ghost" size="icon" aria-label="Remove this new item" onClick={() => setList(rows.filter((_, n) => n !== i))}><Trash2 className="h-4 w-4" aria-hidden /></Button> : null}
          </li>
        ))}
      </ul>
      {canEdit && priceChanged ? <div className="max-w-xs space-y-1.5"><label className="text-sm font-medium" htmlFor="price-from">New prices apply from</label><Input id="price-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><p className="text-xs text-muted-foreground">Laundry given before this date keeps its earlier price.</p></div> : null}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setList([...rows, { name: "", price: "0", active: true }])}><Plus className="mr-2 h-4 w-4" aria-hidden />Add an item</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || list === null}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}Save items and prices</Button>
        </div>
      ) : <p className="text-xs text-muted-foreground">You do not have permission to change this list.</p>}
    </div>
  );
}

function VendorsTab({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const query = useVendors();
  const [list, setList] = useState<Row[] | null>(null);
  const rows = list ?? query.data ?? [];
  const save = useMutation({
    mutationFn: () => call<{ vendors: Row[] }>({ action: "vendors_save", vendors: rows.filter((r) => r.name.trim()) }),
    onSuccess: (d) => { toast.success("Laundry list saved"); setList(null); queryClient.setQueryData(KEYS.vendors, d); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });
  const set = (index: number, patch: Row) => setList(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  if (query.isLoading) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">The laundries you send clothes to. They appear as a drop-down when laundry is given. One you remove is switched off, not deleted, so old records keep its name.</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {rows.length === 0 ? <li className="p-4 text-sm text-muted-foreground">No laundries yet.{isAdmin ? " Add the first one below." : ""}</li> : null}
        {rows.map((r, i) => (
          <li key={r.id ?? `new-${i}`} className={`flex flex-wrap items-center gap-3 p-3 ${r.active === false ? "opacity-60" : ""}`}>
            <Input aria-label="Laundry name" className="min-w-0 flex-1" value={r.name} disabled={!isAdmin} placeholder="Laundry name" onChange={(e) => set(i, { name: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><Switch checked={r.active !== false} disabled={!isAdmin} onCheckedChange={(active) => set(i, { active })} aria-label={`${r.name || "Laundry"} in use`} />{r.active === false ? "Off" : "In use"}</label>
            {isAdmin && !r.id ? <Button type="button" variant="ghost" size="icon" aria-label="Remove this new laundry" onClick={() => setList(rows.filter((_, n) => n !== i))}><Trash2 className="h-4 w-4" aria-hidden /></Button> : null}
          </li>
        ))}
      </ul>
      {isAdmin ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setList([...rows, { name: "", active: true }])}><Plus className="mr-2 h-4 w-4" aria-hidden />Add a laundry</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || list === null}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}Save list</Button>
        </div>
      ) : <p className="text-xs text-muted-foreground">Only an administrator can change this list.</p>}
    </div>
  );
}

function SettlementTab({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const query = useWindow();
  const [form, setForm] = useState<Row | null>(null);
  const w = form ?? query.data;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["laundry"] });
  const save = useMutation({
    mutationFn: () => call<{ window: Row }>({ action: "settings_save", restrict: w!.restrict, rule: w!.rule, day: Number(w!.day) || 1 }),
    onSuccess: (d) => { toast.success("Settlement day saved"); setForm(null); queryClient.setQueryData(KEYS.window, d); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });
  const seed = useMutation({ mutationFn: () => call({ action: "demo_seed" }), onSuccess: () => { toast.success("Demo laundry added"); refresh(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add demo data") });
  const clear = useMutation({ mutationFn: () => call({ action: "demo_clear" }), onSuccess: () => { toast.success("Demo laundry removed"); refresh(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove demo data") });
  if (!w) return <Skeleton className="h-40 w-full" />;
  const set = (patch: Row) => setForm({ ...w, ...patch });
  return (
    <div className="max-w-2xl space-y-6">
      <section className="space-y-4 rounded-lg border border-border p-5">
        <div><h3 className="font-display text-lg">When laundry can be settled</h3><p className="text-sm text-muted-foreground">Turn this on to allow settlement only on one day of the month. Turn it off to settle on any day. Until a record is settled it stays in the current list.</p></div>
        <label className="flex items-center gap-3 text-sm font-medium"><Switch checked={w.restrict} disabled={!isAdmin} onCheckedChange={(restrict) => set({ restrict })} aria-label="Limit settlement to a day" />{w.restrict ? "Settle only on the day below" : "Settle on any day"}</label>
        {w.restrict ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="rule">Settlement day</label>
              <Select value={w.rule} onValueChange={(rule) => set({ rule })} disabled={!isAdmin}><SelectTrigger id="rule"><SelectValue /></SelectTrigger><SelectContent>{RULES.map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent></Select></div>
            {w.rule === "DAY" ? <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="rule-day">Day of the month</label><Input id="rule-day" type="number" min={1} max={31} disabled={!isAdmin} value={w.day} onChange={(e) => set({ day: e.target.value })} /><p className="text-xs text-muted-foreground">In a month with fewer days it falls on the last day.</p></div> : null}
          </div>
        ) : null}
        <p className="text-sm">{w.open ? "Settlement is open today." : `Next settlement day: ${day(w.next_date)}.`}</p>
        {isAdmin ? <Button onClick={() => save.mutate()} disabled={save.isPending || form === null}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}Save</Button> : <p className="text-xs text-muted-foreground">Only an administrator can change this.</p>}
      </section>
      {isAdmin ? (
        <section className="space-y-3 rounded-lg border border-dashed border-border p-5">
          <div><h3 className="font-display text-lg">Test data</h3><p className="text-sm text-muted-foreground">Adds sample items and four sample laundry records (one fully received, one in parts, one partly missing, one still out) so you can try receiving, price changes and settling. They are marked as demo and can be removed here.</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>Add test data</Button><Button variant="outline" onClick={() => { if (window.confirm("Remove all demo laundry records and demo items?")) clear.mutate(); }} disabled={clear.isPending}>Remove test data</Button></div>
        </section>
      ) : null}
    </div>
  );
}

export function LaundryConsole() {
  const scopes = getAdminScopes();
  const isAdmin = scopes.includes("admin");
  const canEditPrices = isAdmin || scopes.includes("laundry");
  const itemsQuery = useItems();
  const outletsQuery = useOutletsQuery();
  const allowed = getAdminOutlets();
  const outlets = (outletsQuery.data ?? []).filter((o) => hasOutletAccess(allowed, o.location_key));
  return (
    <AdminShell scope={["admin", "laundry"]} title="Laundry" description="Track laundry sent out and received back, what is missing, and settle the cost.">
      <Tabs defaultValue="stock" className="space-y-6">
        <TabsList><TabsTrigger value="stock">Out with laundry</TabsTrigger><TabsTrigger value="batches"><Shirt className="mr-2 h-4 w-4" aria-hidden />Laundry</TabsTrigger><TabsTrigger value="settled">Settled</TabsTrigger><TabsTrigger value="missing">Missing items</TabsTrigger><TabsTrigger value="items">Items and prices</TabsTrigger><TabsTrigger value="vendors">Laundries</TabsTrigger><TabsTrigger value="settlement">Settlement day</TabsTrigger></TabsList>
        <TabsContent value="stock" className="mt-0"><OutNow /></TabsContent>
        <TabsContent value="batches" className="mt-0"><Batches items={itemsQuery.data ?? []} outlets={outlets as any[]} isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="settled" className="mt-0"><SettledTab /></TabsContent>
        <TabsContent value="missing" className="mt-0"><Missing /></TabsContent>
        <TabsContent value="items" className="mt-0"><ItemsTab canEdit={canEditPrices} /></TabsContent>
        <TabsContent value="vendors" className="mt-0"><VendorsTab isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="settlement" className="mt-0"><SettlementTab isAdmin={isAdmin} /></TabsContent>
      </Tabs>
    </AdminShell>
  );
}
