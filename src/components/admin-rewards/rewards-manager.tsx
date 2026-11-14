"use client";

import { Children, cloneElement, isValidElement, useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPhone } from "@/lib/phone";
import { QrImage } from "./qr-image";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampaignAnalytics } from "./campaign-analytics";
import { getAdminUser } from "@/lib/authSession";
import { apiPost } from "@/lib/apiClient";

type Row = Record<string, any>;
const blankCampaign = { type: "whatsapp", key: "", destination: "", phone: "", text: "", active: true, utm_source: "", utm_medium: "", utm_campaign: "" };
const blankOption = { key: "", label: "", active: true };
const blankReward = { orderId: "", customerName: "", phone: "", source: "manual", rewardMode: "discount", discountType: "percentage", discountValue: 10, visitTarget: 5, rewardOption: "", expiresAt: "" };
// Three sections by purpose; each holds the screens (keys of the page's ?tab=) that belong together.
const sections: Array<{ key: string; label: string; about: string; screens: Array<[string, string, string]> }> = [
  { key: "links", label: "Campaign links", about: "Links and QR codes you print or post (Instagram, flyers, newspaper). Each one is counted when someone opens it.", screens: [
    ["campaigns", "Your links", "Create and manage links. A link either opens a WhatsApp chat or just records where the visitor came from."],
    ["analytics", "Results", "How many people opened each link, and where they came from."] ] },
  { key: "rewards", label: "Loyalty rewards", about: "Rewards for customers who order. You give a customer a QR code; when they scan it, they get their reward and a visit is added to their phone number.", screens: [
    ["generate", "Give a reward", "Make a QR code for a customer's order."],
    ["records", "Issued QR codes", "QR codes already given out that are waiting to be scanned."],
    ["customers", "Customers", "Each customer's visit count, matched by phone number."] ] },
  { key: "setup", label: "Setup", about: "Things you change rarely.", screens: [
    ["options", "Reward names", "The list of rewards you can pick from, for example a free dessert."],
    ["settings", "Settings", "How long QR codes last, what is stored, and the Zomato/Swiggy links."],
    ["cleanup", "Cleanup", "Delete old QR codes to keep the database tidy."] ] },
];
const tabs = sections.flatMap(section => section.screens);
const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const qrApi = (body: Row) => apiPost<Row>("/admin/qr", body, true);
const date = (value: string) => value ? new Date(value).toLocaleString() : "—";
const localDate = (value: string) => {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return <div className="grid gap-1.5 text-sm font-medium"><label htmlFor={id}>{label}</label>{Children.map(children, (child, index) => index === 0 && isValidElement(child) ? cloneElement(child as React.ReactElement<any>, { id }) : child)}</div>;
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-4 rounded-md border border-border bg-card p-5"><h2 className="font-display text-xl">{title}</h2>{children}</section>;
}
// Reward and campaign numbers are stored as digits that start with the country code; the phone field wants a "+".
const plus = (value: string) => (!value || value.startsWith("+") ? value : /^[6-9]\d{9}$/.test(value.replace(/\D/g, "")) ? `+91${value.replace(/\D/g, "")}` : `+${value.replace(/\D/g, "")}`);
/** The link a reward's QR opens: this site's own address (or the one set under Settings), built from the code. A link saved long ago may name an old host. */
const verifyLink = (row: Row, settings?: Row) => `${String(settings?.publicBaseUrl || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/+$/, "")}/reward/verify?code=${encodeURIComponent(row.code)}`;
const isExpired = (row: Row) => row.status === "pending" && row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now();
const SOURCES = ["manual", "zomato", "swiggy"];
/** Whether a customer's QR was scanned, in words and colour. */
function QrState({ row }: { row: Row }) {
  const states: Record<string, [string, string]> = {
    redeemed: ["Redeemed", "text-success"],
    waiting: ["Not redeemed yet", "text-amber-600"],
    expired: ["Expired, not redeemed", "text-destructive"],
    cancelled: ["Cancelled", "text-muted-foreground"],
    removed: ["Not redeemed (no longer stored)", "text-muted-foreground"],
  };
  const [label, tone] = states[row.state] ?? ["Unknown", "text-muted-foreground"];
  return <span className={`inline-flex flex-col ${tone}`}><span className="font-medium">{label}</span>{row.stateAt ? <small className="font-normal text-muted-foreground">{row.state === "waiting" ? "valid until " : row.state === "expired" ? "on " : ""}{date(row.stateAt)}</small> : null}</span>;
}
const NONE = "__none__"; // Radix Select cannot hold an empty-string item
/** The app's styled dropdown, taking [value, label] pairs; an empty value is allowed. */
function Pick({ value, onChange, options, id }: { value: string | number; onChange: (value: string) => void; options: Array<[string | number, string]>; id?: string }) {
  const enc = (v: string | number) => (v === "" ? NONE : String(v));
  return <Select value={enc(value)} onValueChange={v => onChange(v === NONE ? "" : v)}>
    <SelectTrigger id={id}><SelectValue /></SelectTrigger>
    <SelectContent>{options.map(([v, label]) => <SelectItem key={enc(v)} value={enc(v)}>{label}</SelectItem>)}</SelectContent>
  </Select>;
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{label}</label>;
}
function Table({ headings, children }: { headings: string[]; children: ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b">{headings.map(heading => <th key={heading} className="p-3 font-medium">{heading}</th>)}</tr></thead><tbody className="[&_td]:p-3 [&_tr]:border-b">{children}</tbody></table></div>;
}

export function RewardsManager() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("campaigns");
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (tabs.some(([key]) => key === requested)) setTab(requested!);
    const user = getAdminUser();
    setAllowed(Boolean(user?.roles.includes("admin") && user?.outlets.includes("all")));
    localStorage.removeItem("redChillyRewardToken");
  }, []);
  const current = sections.find(section => section.screens.some(([key]) => key === tab)) ?? sections[0];
  const screen = current.screens.find(([key]) => key === tab) ?? current.screens[0];
  const query = useQuery({ queryKey: ["qr-admin"], enabled: allowed, queryFn: () => qrApi({ action: "load" }) });
  const data = query.data;
  async function run(body: Row, message?: string) {
    setBusy(true); setError("");
    try {
      const result = await qrApi(body);
      if (message) toast.success(message);
      await queryClient.invalidateQueries({ queryKey: ["qr-admin"] });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to complete this action";
      setError(message); toast.error(message);
      return null;
    } finally { setBusy(false); }
  }
  function selectTab(value: string) {
    setTab(value); setError("");
    const url = new URL(window.location.href); url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  }
  return <AdminShell scope="admin" title="Campaigns and rewards" description="Track where visitors come from, and reward returning customers.">
    {!allowed ? <p>These shared tools require an administrator with access to all branches.</p> : <>
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Sections">{sections.map(section => <Button key={section.key} role="tab" aria-selected={section === current} variant={section === current ? "default" : "outline"} onClick={() => selectTab(section.screens[0][0])}>{section.label}</Button>)}</div>
      <p className="mb-4 text-sm text-muted-foreground">{current.about}</p>
      <div className="mb-2 flex flex-wrap gap-1 border-b" role="tablist" aria-label={current.label}>{current.screens.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`} onClick={() => selectTab(key)}>{label}</button>)}</div>
      <p className="mb-5 text-sm text-muted-foreground">{screen[2]}</p>
      {(error || query.error) && <p role="alert" className="mb-4 text-sm text-destructive">{error || query.error?.message}</p>}
      {query.isLoading && <p>Loading QR tools…</p>}
      {data && <div className="space-y-5" role="tabpanel">
        {tab === "campaigns" && <Campaigns rows={data.campaigns} busy={busy} run={run} />}
        {tab === "analytics" && <CampaignAnalytics campaigns={data.campaigns} />}
        {tab === "generate" && <Generator options={data.options} settings={data.settings} busy={busy} run={run} />}
        {tab === "records" && <Records options={data.options} settings={data.settings} busy={busy} run={run} />}
        {tab === "customers" && <Customers busy={busy} run={run} />}
        {tab === "options" && <Options rows={data.options} busy={busy} run={run} />}
        {tab === "settings" && <Settings initial={data.settings} busy={busy} run={run} />}
        {tab === "cleanup" && <Cleanup busy={busy} run={run} />}
      </div>}
    </>}
  </AdminShell>;
}

type ToolProps = { busy: boolean; run: (body: Row, message?: string) => Promise<Row | null> };
function Campaigns({ rows, busy, run }: ToolProps & { rows: Row[] }) {
  const [form, setForm] = useState<Row>(blankCampaign);
  const [originalKey, setOriginalKey] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Opens the form blank for a new campaign, or filled for an edit; with no argument it closes it.
  function edit(row?: Row, open = Boolean(row)) { setOriginalKey(row?.key || null); setFormOpen(open); setForm(row ? { ...blankCampaign, type: row.type || "whatsapp", destination: row.destination || "", key: row.key, phone: row.phone, text: row.text, active: row.active !== false, utm_source: row.utm_source || "", utm_medium: row.utm_medium || "", utm_campaign: row.utm_campaign || "" } : blankCampaign); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (originalKey && form.key !== originalKey && !window.confirm("Changing the campaign key breaks QR links using the old key. Continue?")) return;
    if (await run({ action: "save_campaign", originalKey, data: form }, "Campaign saved")) edit();
  }
  return <>
    <Panel title="Your links"><p className="text-sm text-muted-foreground">The link for a campaign is <code>{typeof window !== "undefined" ? window.location.origin : ""}/&lt;key&gt;</code>. Do not change a key once it is printed.</p>
      <Button variant="outline" onClick={() => edit(undefined, true)}>New campaign</Button>
      <Table headings={["Campaign key", "Type / phone", "UTM", "Status", "Actions"]}>{rows.map(row => <tr key={row.key}><td>{row.key}<p className="mt-1 max-w-md whitespace-pre-wrap text-xs text-muted-foreground">{row.type === "tracking" ? `Opens ${row.destination || "the website home page"}` : row.text}</p></td><td>{row.type === "tracking" ? "Tracking only" : row.phone}</td><td className="text-xs">{[row.utm_source, row.utm_medium, row.utm_campaign].filter(Boolean).join(" / ") || "—"}</td><td>{row.active === false ? "Inactive" : "Active"}</td><td><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => edit(row)}>Edit</Button><Button variant="outline" size="sm" asChild><a href={`/get?key=${encodeURIComponent(row.key)}&track=0`} target="_blank" rel="noreferrer">Test link</a></Button><Button variant="destructive" size="sm" disabled={busy} onClick={async () => { if (window.confirm(`Delete ${row.key}? Its QR links will stop working.`)) { if (await run({ action: "delete_campaign", key: row.key }, "Campaign deleted")) edit(); } }}>Delete</Button></div></td></tr>)}</Table>
      {!rows.length && <p>No campaigns yet. Create one below.</p>}
    </Panel>
    {formOpen && <Panel title={originalKey ? "Edit campaign" : "Create campaign"}><form onSubmit={save} className="grid gap-4 md:grid-cols-2">
      <Field label="Campaign type"><Pick value={form.type} onChange={type => setForm({ ...form, type })} options={[["whatsapp", "WhatsApp message (opens a chat)"], ["tracking", "Tracking only (UTM, no WhatsApp)"]]} /></Field>
      <Field label="Campaign key"><Input required value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} /></Field>
      {form.type === "whatsapp" ? <>
        <Field label="WhatsApp phone"><PhoneInput required value={plus(form.phone)} onChange={phone => setForm({ ...form, phone })} /></Field>
        <div className="md:col-span-2"><Field label="WhatsApp message"><textarea required maxLength={4000} rows={6} className={inputClass} value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} /></Field></div>
      </> : <div className="md:col-span-2"><Field label="Send visitors to (optional)"><Input placeholder="https://… or /order-online. Blank opens the website home page" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} /></Field><p className="mt-1.5 text-xs text-muted-foreground">Every scan or click on this link is counted with the UTM values below, then the visitor continues to this page. No phone number or message is needed.</p></div>}
      <Field label={form.type === "tracking" ? "UTM source *" : "UTM source (optional)"}><Input required={form.type === "tracking"} placeholder="instagram, flyer, newspaper…" value={form.utm_source} onChange={e => setForm({ ...form, utm_source: e.target.value })} /></Field>
      <Field label={form.type === "tracking" ? "UTM medium *" : "UTM medium (optional)"}><Input required={form.type === "tracking"} placeholder="social, qr, print…" value={form.utm_medium} onChange={e => setForm({ ...form, utm_medium: e.target.value })} /></Field>
      <Field label="UTM campaign name (optional)"><Input placeholder="diwali-offer" value={form.utm_campaign} onChange={e => setForm({ ...form, utm_campaign: e.target.value })} /></Field>
      <Check label="Campaign active" checked={form.active} onChange={active => setForm({ ...form, active })} />
      <div className="flex justify-end gap-2 md:col-span-2"><Button type="button" variant="outline" onClick={() => edit()}>Cancel</Button><Button disabled={busy}>Save campaign</Button></div>
    </form></Panel>}
  </>;
}

function RewardFields({ form, setForm, options }: { form: Row; setForm: (form: Row) => void; options: Row[] }) {
  const field = (name: string, value: any) => setForm({ ...form, [name]: value });
  return <>
    <Field label="Order ID"><Input value={form.orderId} onChange={e => field("orderId", e.target.value)} /></Field>
    <Field label="Customer name"><Input value={form.customerName} onChange={e => field("customerName", e.target.value)} /></Field>
    <Field label="Phone"><PhoneInput required={form.rewardMode === "visits"} value={plus(form.phone)} onChange={phone => field("phone", phone)} /></Field>
    <Field label="Order source"><Pick value={SOURCES.includes(form.source) ? form.source : "other"} onChange={value => field("source", value === "other" ? "" : value)} options={[["manual", "Manual"], ["zomato", "Zomato"], ["swiggy", "Swiggy"], ["other", "Other…"]]} />{!SOURCES.includes(form.source) && <Input required placeholder="Where the order came from" value={form.source} onChange={e => field("source", e.target.value)} />}</Field>
    <Field label="Reward type"><Pick value={form.rewardMode} onChange={v => field("rewardMode", v)} options={[["discount", "Discount"], ["visits", "Visit tracker"]]} /></Field>
    {form.rewardMode === "visits" ? <Field label="Visits required"><Input required type="number" min={1} max={1000} value={form.visitTarget} onChange={e => field("visitTarget", e.target.value)} /></Field> : <>
      <Field label="Discount type"><Pick value={form.discountType} onChange={v => field("discountType", v)} options={[["percentage", "Percentage"], ["price", "Amount (₹)"]]} /></Field>
      <Field label="Discount value"><Input required type="number" min={1} max={form.discountType === "percentage" ? 100 : 100000} value={form.discountValue} onChange={e => field("discountValue", e.target.value)} /></Field>
    </>}
    <Field label="Reward option"><Pick value={form.rewardOption} onChange={v => field("rewardOption", v)} options={[["", "Choose automatically"], ...options.filter(row => row.active !== false).map((row): [string, string] => [row.key, row.label])]} /></Field>
    <Field label="Expiry"><Input type="datetime-local" value={form.expiresAt} onChange={e => field("expiresAt", e.target.value)} /></Field>
  </>;
}

async function banner(data: Row): Promise<Blob> {
  const canvas = document.createElement("canvas"); canvas.width = 900; canvas.height = 1100;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff9ef"; context.fillRect(0, 0, 900, 1100);
  context.fillStyle = "#5d070c"; context.textAlign = "center"; context.font = "bold 58px sans-serif"; context.fillText("Red Chilly", 450, 100);
  context.font = "32px sans-serif"; context.fillText("Your reward is ready", 450, 165);
  const image = new Image(); image.src = data.qrImage; await image.decode(); context.drawImage(image, 170, 220, 560, 560);
  context.font = "26px sans-serif"; context.fillText(`Order: ${data.orderId}`, 450, 850, 800);
  context.fillText(data.customerName || "Thank you for your order", 450, 905, 800);
  context.fillText(`Valid until ${date(data.expiresAt)}`, 450, 960, 800);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Unable to create image")), "image/png"));
}
/** What a reward's QR is shared with: the sharing message from Settings, filled in for this reward. */
const shareText = (row: Row, link: string, settings: Row) =>
  String(settings?.shareMessage || "").replace(/\{(customerName|orderId|verifyUrl|reward)\}/g, (_: string, key: string) => (key === "reward" ? row.rewardConfig?.rewardOptionLabel || "your reward" : key === "verifyUrl" ? link : String(row[key] || "")));

/** Download, copy and share buttons for a reward's QR (the picture, the link, or a WhatsApp message to the customer). */
function RewardShare({ row, link, settings }: { row: Row; link: string; settings: Row }) {
  const [working, setWorking] = useState(false);
  async function picture(action: "download" | "copy" | "share") {
    setWorking(true);
    try {
      const QRCode = (await import("qrcode")).default;
      const qrImage = await QRCode.toDataURL(link, { margin: 1, width: 560, color: { dark: "#5d070c", light: "#fff9ef" } });
      const blob = await banner({ ...row, qrImage });
      const file = new File([blob], `reward-${row.orderId || "qr"}.png`, { type: "image/png" });
      if (action === "copy") { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); toast.success("Image copied"); }
      else if (action === "share" && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Red Chilly reward", text: shareText(row, link, settings) });
      else { if (action === "share") toast.info("Sharing isn't available in this browser, so the image was downloaded."); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (err) { if ((err as Error).name !== "AbortError") toast.error((err as Error).message); } finally { setWorking(false); }
  }
  const digits = String(row.phone || "").replace(/\D/g, "");
  return <div className="flex flex-wrap gap-2">
    <Button type="button" size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(link); toast.success("Link copied"); }}>Copy link</Button>
    <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => picture("copy")}>Copy image</Button>
    <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => picture("share")}>Share image</Button>
    <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => picture("download")}>Download image</Button>
    <Button type="button" size="sm" variant="outline" asChild><a href={`https://api.whatsapp.com/send?${digits ? `phone=${digits}&` : ""}text=${encodeURIComponent(shareText(row, link, settings))}`} target="_blank" rel="noreferrer">Share on WhatsApp</a></Button>
  </div>;
}

function Generator({ options, settings, busy, run }: ToolProps & { options: Row[]; settings: Row }) {
  const initial = () => ({ ...blankReward, expiresAt: localDate(new Date(Date.now() + settings.expiryDays * 86400000).toISOString()) });
  const [form, setForm] = useState<Row>(initial);
  const [result, setResult] = useState<Row | null>(null);
  const [customer, setCustomer] = useState<Row | null>(null);
  async function generate(event: FormEvent) {
    event.preventDefault(); setResult(null);
    const response = await run({ action: "generate", data: { ...form, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : "" } }, "QR generated");
    if (response) { setResult(response.data); setCustomer(response.data.customer); }
  }
  const message = result ? settings.shareMessage.replace(/\{(customerName|orderId|verifyUrl|reward)\}/g, (_: string, key: string) => String(key === "reward" ? result.rewardConfig?.rewardOptionLabel || "your reward" : result[key] || "")) : "";
  return <>
    <details className="rounded-md border border-border bg-card p-5"><summary className="cursor-pointer font-display text-xl">How are visits counted?</summary><ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
      <li><strong className="text-foreground">The phone number identifies the customer.</strong> A visit is added to whoever has the same phone number. Only the digits are compared, so "+91 98765 43210", "919876543210" and an Indian "9876543210" are all the same person. Pick the right country code for other countries.</li>
      <li><strong className="text-foreground">A visit is counted when the customer's QR is scanned</strong>, not when you generate it. Generating only records the QR against the customer (it adds to their "QR codes generated" count).</li>
      <li><strong className="text-foreground">One QR gives one visit.</strong> A QR works once; scanning it again, or after it expires, adds nothing. The Order ID is only a label and is not used to match customers or prevent repeats.</li>
      <li><strong className="text-foreground">No phone, no points.</strong> A QR generated without a phone number cannot add visits to anyone. Visit tracker rewards require a phone number.</li>
      <li><strong className="text-foreground">Visit tracker:</strong> when the customer's current visit count reaches "Visits required", the reward unlocks and the count starts again (any extra visits carry over). A customer who is part-way through a cycle keeps that cycle's target, even if you enter a different number for a later QR.</li>
      <li><strong className="text-foreground">Discount:</strong> the customer gets that reward when the QR is scanned, and the scan still counts as a visit.</li>
      <li>Wrong count or name? Fix it on the <button type="button" className="underline" onClick={() => window.location.assign("/admin/rewards?tab=customers")}>Customers</button> tab.</li>
    </ul></details>
    <Panel title="Reward details"><form onSubmit={generate} className="grid gap-4 md:grid-cols-2"><RewardFields form={form} setForm={setForm} options={options} />
      <div className="flex flex-wrap gap-2 md:col-span-2"><Button disabled={busy}>Generate QR</Button><Button type="button" variant="outline" disabled={busy || !form.phone} onClick={async () => { const response = await run({ action: "customer", phone: form.phone }); if (response) setCustomer(response.customer); }}>Look up customer</Button><Button type="button" variant="outline" onClick={() => { setForm(initial()); setResult(null); setCustomer(null); }}>Reset</Button></div>
    </form></Panel>
    {customer && <Panel title="Customer visits"><p>{customer.customerName || form.customerName || "Customer"}: {customer.visitCount || 0} visits in the current cycle · {customer.totalVisits || 0} total visits · {customer.totalQrGenerated || 0} QR codes generated.</p>{customer.activeVisitTarget > 0 && <p>Current target: {customer.activeVisitTarget} visits. A cycle already in progress keeps its existing target and reward.</p>}</Panel>}
    {result && <Panel title="Generated reward"><div className="flex flex-col gap-5 md:flex-row"><img src={result.qrImage} alt="Reward verification QR code" width={260} height={260} /><div className="space-y-3 break-all"><p>Order: {result.orderId}</p><p>Expires: {date(result.expiresAt)}</p><a className="text-primary underline" href={result.verifyUrl} target="_blank" rel="noreferrer">{result.verifyUrl}</a><p className="text-xs text-muted-foreground">Opening the verification link redeems the reward.</p><RewardShare row={result} link={result.verifyUrl} settings={settings} /></div></div></Panel>}
  </>;
}

function Records({ options, settings, busy, run }: ToolProps & { options: Row[]; settings: Row }) {
  const [status, setStatus] = useState(""); const [search, setSearch] = useState(""); const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const query = useQuery({ queryKey: ["qr-admin", "records", status, search, offset], queryFn: () => qrApi({ action: "list_rewards", status, search, offset }) });
  function edit(row: Row) { setEditing({ ...blankReward, ...row, rewardMode: row.rewardConfig?.mode || "discount", discountType: row.rewardConfig?.discountType || "percentage", discountValue: row.rewardConfig?.discountValue || 10, visitTarget: row.rewardConfig?.visitTarget || 5, rewardOption: row.rewardConfig?.rewardOption || "", expiresAt: localDate(isExpired(row) ? new Date(Date.now() + Number(settings?.expiryDays || 30) * 86400000).toISOString() : row.expiresAt) }); setViewing(null); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing) return;
    if (new Date(editing.expiresAt).getTime() <= Date.now()) { toast.error("Choose an expiry date in the future."); return; }
    const { code, orderId, customerName = "", phone = "", source = "manual", expiresAt, rewardMode, discountType, discountValue, visitTarget, rewardOption } = editing;
    if (await run({ action: "save_reward", data: { code, orderId, customerName, phone, source, expiresAt: new Date(expiresAt).toISOString(), rewardConfig: { mode: rewardMode, discountType, discountValue, visitTarget, rewardOption } } }, "Reward updated")) setEditing(null);
  }
  return <>
    <Panel title="QR codes waiting to be scanned"><div className="flex flex-wrap gap-3"><Field label="Status"><Pick value={status} onChange={v => { setStatus(v); setOffset(0); }} options={[["", "All statuses"], ...["pending", "verified", "redeeming", "cancelled"].map((value): [string, string] => [value, value])]} /></Field><Field label="Exact order ID, code or phone"><Input value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} /></Field></div>
      {query.error && <p role="alert">{query.error.message}</p>}{query.isLoading && <p>Loading…</p>}
      <Table headings={["QR code", "Order / customer", "Reward", "Status", "Expiry", "Actions"]}>{query.data?.records.map((row: Row) => <tr key={row.code}><td><button type="button" className="block" onClick={() => setViewing(row)} aria-label={`Show the QR code for ${row.orderId}`}><QrImage url={verifyLink(row, settings)} size={72} label={`QR code for ${row.orderId}`} /></button></td><td>{row.orderId}<p>{row.customerName} {row.phone ? formatPhone(plus(row.phone)) : ""}</p><small className="break-all text-muted-foreground">{row.code}</small></td><td>{row.rewardConfig?.mode === "visits" ? `${row.rewardConfig.visitTarget} visits` : `${row.rewardConfig?.discountValue || 10}${row.rewardConfig?.discountType === "price" ? " INR" : "%"}`}<p>{row.rewardConfig?.rewardOptionLabel}</p></td><td>{isExpired(row) ? "pending, expired" : row.status}</td><td>{date(row.expiresAt)}</td><td><div className="flex flex-wrap gap-2">{row.status === "pending" && <><Button size="sm" variant="outline" disabled={busy} onClick={() => edit(row)}>Edit</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm("Cancel this reward? Its QR will no longer redeem.")) run({ action: "cancel_reward", code: row.code }, "Reward cancelled"); }}>Cancel</Button></>}<Button size="sm" variant="destructive" disabled={busy || row.status === "redeeming"} onClick={() => { if (window.confirm("Permanently delete this reward record?")) run({ action: "delete_reward", code: row.code }, "Reward deleted"); }}>Delete</Button></div></td></tr>)}</Table>
      {query.data?.records.length === 0 && <p>No matching rewards. Redeemed records may have been deleted by the retention setting.</p>}
      <div className="flex gap-2"><Button variant="outline" disabled={offset === 0} onClick={() => setOffset(offset - 50)}>Previous</Button><Button variant="outline" disabled={!query.data?.hasMore} onClick={() => setOffset(offset + 50)}>Next</Button></div>
    </Panel>
    <Dialog open={editing !== null} onOpenChange={open => !open && setEditing(null)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Edit pending reward</DialogTitle><DialogDescription>The QR verification link stays the same, so a printed or sent QR keeps working. Customer history already recorded is kept.</DialogDescription></DialogHeader>
        {editing && <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-4 md:col-span-2"><QrImage url={verifyLink(editing, settings)} size={96} label="QR code for this reward" /><div className="min-w-0 text-sm"><p className="font-medium">{editing.orderId}</p><p className="break-all text-xs text-muted-foreground">{verifyLink(editing, settings)}</p>{isExpired(editing) || new Date(editing.expiresAt).getTime() <= Date.now() ? <p className="mt-1 text-xs text-destructive">This QR has expired. Choose a new expiry below to make it work again.</p> : null}<div className="mt-2"><RewardShare row={{ ...editing, phone: editing.phone }} link={verifyLink(editing, settings)} settings={settings} /></div></div></div>
          <RewardFields form={editing} setForm={setEditing} options={options} />
          <div className="flex gap-2 md:col-span-2"><Button disabled={busy}>Save reward</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>Close</Button></div>
        </form>}
      </DialogContent>
    </Dialog>
    <Dialog open={viewing !== null} onOpenChange={open => !open && setViewing(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>QR code</DialogTitle><DialogDescription>{viewing?.orderId}{viewing?.customerName ? `, ${viewing.customerName}` : ""}</DialogDescription></DialogHeader>
        {viewing && <div className="space-y-3 text-center">
          <div className="flex justify-center"><QrImage url={verifyLink(viewing, settings)} size={256} label={`QR code for ${viewing.orderId}`} /></div>
          <p className="break-all text-xs text-muted-foreground">{verifyLink(viewing, settings)}</p>
          <div className="flex flex-col items-center gap-2">
            <RewardShare row={viewing} link={verifyLink(viewing, settings)} settings={settings} />
            {viewing.status === "pending" && <Button type="button" size="sm" onClick={() => edit(viewing)}>Edit</Button>}
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}

function Customers({ busy, run }: ToolProps) {
  const [phone, setPhone] = useState(""); const [offset, setOffset] = useState(0); const [editing, setEditing] = useState<Row | null>(null); const [history, setHistory] = useState<Row | null>(null);
  const query = useQuery({ queryKey: ["qr-admin", "customers", phone, offset], queryFn: () => qrApi({ action: "list_customers", phone, offset }) });
  async function save(event: FormEvent) { event.preventDefault(); if (await run({ action: "save_customer", data: editing }, "Customer updated")) setEditing(null); }
  return <>
    <Panel title="Customer history"><Field label="Find by phone"><PhoneInput value={plus(phone)} onChange={value => { setPhone(value); setOffset(0); }} /></Field>{query.error && <p role="alert">{query.error.message}</p>}
      <Table headings={["Customer", "Current / total visits", "QR codes", "Actions"]}>{query.data?.customers.map((row: Row) => <tr key={row.phone}><td>{row.customerName}<p>{row.phone}</p></td><td>{row.visitCount || 0} / {row.totalVisits || 0}</td><td>{row.totalQrGenerated || 0}</td><td><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditing({ phone: row.phone, customerName: row.customerName || "", visitCount: row.visitCount || 0, totalVisits: row.totalVisits || 0, activeVisitTarget: row.activeVisitTarget || 0 })}>Edit</Button><Button size="sm" variant="outline" onClick={async () => { const result = await run({ action: "customer", phone: row.phone }); if (result) setHistory(result.customer); }}>View history</Button></div></td></tr>)}</Table>
      <div className="flex gap-2"><Button variant="outline" disabled={!offset} onClick={() => setOffset(offset - 50)}>Previous</Button><Button variant="outline" disabled={query.data?.customers.length !== 50} onClick={() => setOffset(offset + 50)}>Next</Button></div>
    </Panel>
    {editing && <Panel title={`Edit customer ${editing.phone}`}><form onSubmit={save} className="grid gap-4 md:grid-cols-2">{[["customerName", "Customer name"], ["visitCount", "Visits in current cycle"], ["totalVisits", "Total visits"], ["activeVisitTarget", "Current visit target (0 for none)"]].map(([key, label]) => <Field key={key} label={label}><Input type={key === "customerName" ? "text" : "number"} min={0} required={key !== "customerName"} value={editing[key]} onChange={e => setEditing({ ...editing, [key]: e.target.value })} /></Field>)}<p className="text-sm text-muted-foreground md:col-span-2">Visit corrections do not grant rewards or alter existing reward history.</p><div className="flex gap-2"><Button disabled={busy}>Save customer</Button><Button variant="outline" type="button" onClick={() => setEditing(null)}>Close</Button></div></form></Panel>}
    {history && <Panel title={`History for ${history.customerName || history.phone}`}><p>Member since {date(history.memberSince)} · {history.rewardsUnlocked || 0} reward{(history.rewardsUnlocked || 0) === 1 ? "" : "s"} given</p><h3 className="font-medium">Recent orders and QR codes</h3><Table headings={["Order", "Source", "Generated", "Redeemed?"]}>{(history.qrHistory || []).map((row: Row, i: number) => <tr key={i}><td>{row.orderId}</td><td>{row.source}</td><td>{date(row.generatedAt)}</td><td><QrState row={row} /></td></tr>)}</Table><h3 className="font-medium">Rewards given (each scan)</h3><Table headings={["Order", "Reward", "How", "Date"]}>{[...(history.rewardHistory || [])].reverse().map((row: Row, i: number) => <tr key={i}><td>{row.orderId}</td><td>{row.reward}</td><td>{row.mode === "visits" ? `Unlocked after ${row.visitTarget} visits` : "Scanned QR"}</td><td>{date(row.unlockedAt)}</td></tr>)}</Table>{!(history.rewardHistory || []).length && <p className="text-sm text-muted-foreground">No rewards given yet. A reward is listed here each time a QR is scanned.</p>}<Button variant="outline" onClick={() => setHistory(null)}>Close history</Button></Panel>}
  </>;
}

function Options({ rows, busy, run }: ToolProps & { rows: Row[] }) {
  const [form, setForm] = useState<Row>(blankOption); const [originalKey, setOriginalKey] = useState<string | null>(null);
  function reset() { setForm(blankOption); setOriginalKey(null); }
  async function save(event: FormEvent) { event.preventDefault(); if (await run({ action: "save_option", originalKey, data: form }, "Reward option saved")) reset(); }
  return <>
    <Panel title="Reward names"><p className="text-sm text-muted-foreground">Changes apply to newly generated or edited QR codes. Existing codes retain the reward label they were issued with.</p><div className="flex gap-2"><Button variant="outline" onClick={reset}>New option</Button>{!rows.length && <Button disabled={busy} onClick={() => run({ action: "seed_options" }, "Default reward options loaded")}>Load default options</Button>}</div><Table headings={["Key", "Label", "Status", "Actions"]}>{rows.map(row => <tr key={row.key}><td>{row.key}</td><td>{row.label}</td><td>{row.active === false ? "Inactive" : "Active"}</td><td><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setOriginalKey(row.key); setForm({ key: row.key, label: row.label, active: row.active !== false }); }}>Edit</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm(`Delete reward option ${row.label}?`)) run({ action: "delete_option", key: row.key }, "Option deleted"); }}>Delete</Button></div></td></tr>)}</Table></Panel>
    <Panel title={originalKey ? "Edit reward option" : "Create reward option"}><form onSubmit={save} className="grid gap-4 md:grid-cols-2"><Field label="Option key"><Input required disabled={Boolean(originalKey)} value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} /></Field><Field label="Reward label"><Input required value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} /></Field><Check label="Active" checked={form.active} onChange={active => setForm({ ...form, active })} /><div className="flex gap-2"><Button disabled={busy}>Save option</Button><Button type="button" variant="outline" onClick={reset}>Clear</Button></div></form></Panel>
  </>;
}
function Settings({ initial, busy, run }: ToolProps & { initial: Row }) {
  const [form, setForm] = useState<Row>(initial);
  async function save(event: FormEvent) { event.preventDefault(); await run({ action: "save_settings", data: { ...form, expiryDays: Number(form.expiryDays), maxRecords: Number(form.maxRecords) } }, "Settings saved"); }
  return <Panel title="Settings"><form onSubmit={save} className="grid gap-4 md:grid-cols-2"><Field label="Default expiry (days)"><Input required type="number" min={1} max={365} value={form.expiryDays} onChange={e => setForm({ ...form, expiryDays: e.target.value })} /></Field><Field label="Maximum stored QR records"><Input required type="number" min={1} max={100000} value={form.maxRecords} onChange={e => setForm({ ...form, maxRecords: e.target.value })} /></Field><Check label="Delete QR record after successful redemption" checked={form.deleteOnVerify} onChange={deleteOnVerify => setForm({ ...form, deleteOnVerify })} /><Check label="Anyone can redeem a reward by opening its link" checked={form.publicScan !== false} onChange={publicScan => setForm({ ...form, publicScan })} /><p className="text-xs text-muted-foreground">On: the customer scanning their own QR with their phone redeems it. Off: opening the link does nothing except tell them to show the QR to staff; only the people given the <strong>Loyalty rewards</strong> role (and administrators) can redeem it, with the <a className="underline" href="/admin/loyalty-scan">reward scanner</a> in the staff portal.</p><p className="text-xs text-muted-foreground">Turn this off to retain redeemed records until cleanup. Customer visit history is retained either way.</p>{[["publicBaseUrl", "Public QR base URL (optional)"], ["zomatoUrl", "Zomato ordering URL"], ["swiggyUrl", "Swiggy ordering URL"]].map(([key, label]) => <Field key={key} label={label}><Input type="url" required={key !== "publicBaseUrl"} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></Field>)}<div className="md:col-span-2"><Field label="Reward WhatsApp sharing message"><textarea required rows={4} className={inputClass} value={form.shareMessage} onChange={e => setForm({ ...form, shareMessage: e.target.value })} /></Field><p className="mt-1 text-xs text-muted-foreground">Available placeholders: {"{customerName}, {orderId}, {verifyUrl}, {reward}"}. The campaign message editor controls messages from campaign QR scans.</p></div><div><Button disabled={busy}>Save settings</Button></div></form></Panel>;
}
function Cleanup({ busy, run }: ToolProps) {
  const [result, setResult] = useState<Row | null>(null);
  async function clean(force: boolean) {
    if (!window.confirm(force ? "Permanently delete all QR reward records? Pending QR codes will stop working. Customer history will remain." : "Delete expired, redeemed, cancelled and excess QR records?")) return;
    const response = await run({ action: "cleanup", force }, "Cleanup completed"); if (response) setResult(response.result);
  }
  return <Panel title="Cleanup"><p className="text-sm text-muted-foreground">Standard cleanup removes expired and completed records, then the oldest excess records above your configured limit. Force cleanup removes all QR records. Campaign messages and customer history are retained.</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => clean(false)}>Run standard cleanup</Button><Button variant="destructive" disabled={busy} onClick={() => clean(true)}>Delete all QR records</Button></div>{result && <p role="status">Removed {result.expiredDeleted} expired or completed records and {result.overflowDeleted} additional records. Storage limit: {result.maxRecords}.</p>}</Panel>;
}
