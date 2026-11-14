"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Repeat, TrendingUp, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiPost } from "@/lib/apiClient";

type Row = Record<string, any>;
export type Slice = { name: string; visits: number; visitors: number };

// Series colours: brand red first, then fixed order. Every use is also labelled in text, so colour is never the only cue.
const PRIMARY = "hsl(var(--primary))";
const PALETTE = [PRIMARY, "#3b82a0", "#d9a441", "#7a8f5a", "#8a6bb0"];
export const DAY_CHOICES = [7, 30, 90];
const ALL = "__all__";

export const dayKey = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export function Card({ title, hint, children, className = "" }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-border bg-card p-5 ${className}`}>
      <h3 className="font-display text-lg leading-tight">{title}</h3>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - (v / max) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" className="mt-3 h-8 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke={PRIMARY} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Kpi({ icon, label, value, note, spark }: { icon: ReactNode; label: string; value: ReactNode; note?: string; spark?: number[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className="rounded-md bg-primary/10 p-1.5 text-primary">{icon}</span>{label}</div>
      <p className="mt-3 font-display text-3xl leading-none">{value}</p>
      {note ? <p className="mt-1.5 text-xs text-muted-foreground">{note}</p> : null}
      {spark ? <Spark values={spark} /> : null}
    </div>
  );
}

/** Visits (filled area) and unique people (line) per day, with a hover read-out. */
export function TrendChart({ days }: { days: Array<{ date: string; visits: number; visitors: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 220, L = 34, R = 10, T = 12, B = 24;
  const max = Math.max(4, ...days.map(d => d.visits));
  const x = (i: number) => L + (days.length < 2 ? (W - L - R) / 2 : (i / (days.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = (key: "visits" | "visitors") => days.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d[key])}`).join(" ");
  const area = `${line("visits")} L${x(days.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = [0, 0.5, 1].map(f => Math.round(max * f));
  const labelEvery = Math.ceil(days.length / 7);
  const active = hover === null ? null : days[hover];
  return (
    <div className="relative">
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: PRIMARY, opacity: 0.35 }} />Visits</span>
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-4" style={{ background: PALETTE[1] }} />Unique people</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Visits and unique people per day"
        onMouseLeave={() => setHover(null)}
        onMouseMove={e => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          setHover(Math.max(0, Math.min(days.length - 1, Math.round(((px - L) / (W - L - R)) * (days.length - 1)))));
        }}>
        <defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PRIMARY} stopOpacity={0.35} /><stop offset="100%" stopColor={PRIMARY} stopOpacity={0.02} /></linearGradient></defs>
        {ticks.map(t => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.1} /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.55}>{t}</text></g>)}
        <path d={area} fill="url(#trend-fill)" />
        <path d={line("visits")} fill="none" stroke={PRIMARY} strokeWidth={2} strokeLinejoin="round" />
        <path d={line("visitors")} fill="none" stroke={PALETTE[1]} strokeWidth={2} strokeLinejoin="round" />
        {days.map((d, i) => i % labelEvery === 0 ? <text key={d.date} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.55}>{shortDay(d.date)}</text> : null)}
        {active ? <g><line x1={x(hover!)} x2={x(hover!)} y1={T} y2={y(0)} stroke="currentColor" strokeOpacity={0.25} /><circle cx={x(hover!)} cy={y(active.visits)} r={4} fill={PRIMARY} stroke="hsl(var(--card))" strokeWidth={2} /><circle cx={x(hover!)} cy={y(active.visitors)} r={4} fill={PALETTE[1]} stroke="hsl(var(--card))" strokeWidth={2} /></g> : null}
      </svg>
      {active ? (
        <div className="pointer-events-none absolute top-6 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md" style={{ left: `${Math.min(80, Math.max(2, (x(hover!) / W) * 100 - 8))}%` }}>
          <p className="font-medium">{shortDay(active.date)}</p>
          <p>{active.visits} visits · {active.visitors} people</p>
        </div>
      ) : null}
    </div>
  );
}

/** Which hours of the day (India time) people open the links. */
export function HourBars({ hourly }: { hourly: Array<{ hour: number; visits: number }> }) {
  const byHour = new Map(hourly.map(h => [h.hour, h.visits]));
  const values = Array.from({ length: 24 }, (_, h) => byHour.get(h) ?? 0);
  const max = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  const label = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]">
        {values.map((v, h) => <div key={h} title={`${label(h)}: ${v} visits`} className="flex-1 rounded-t-[3px]" style={{ height: `${Math.max(v ? 4 : 1, (v / max) * 100)}%`, background: PRIMARY, opacity: h === peak && v ? 1 : 0.4 }} />)}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
      {Math.max(...values) > 0 ? <p className="mt-2 text-xs text-muted-foreground">Busiest around <strong className="text-foreground">{label(peak)}</strong>.</p> : null}
    </div>
  );
}

export function Ranked({ rows, total, empty = "Nothing recorded yet." }: { rows: Slice[]; total: number; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...rows.map(r => r.visits));
  return (
    <ul className="space-y-3">
      {rows.slice(0, 8).map((row, i) => (
        <li key={row.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 break-words font-medium">{row.name}</span><span className="shrink-0 tabular-nums text-muted-foreground"><strong className="text-foreground">{row.visits}</strong> · {pct(row.visits, total)}%</span></div>
          <div className="mt-1.5 h-2 rounded-full bg-muted"><div className="h-2 rounded-full" style={{ width: `${(row.visits / max) * 100}%`, background: i === 0 ? PRIMARY : "hsl(var(--primary) / 0.45)" }} /></div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{row.visitors} {row.visitors === 1 ? "person" : "people"}</p>
        </li>
      ))}
    </ul>
  );
}

export function Donut({ rows, total }: { rows: Slice[]; total: number }) {
  if (!total) return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>;
  const R = 40, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-90" role="img" aria-label="Visits by device">
        <circle cx={50} cy={50} r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={14} />
        {rows.slice(0, 4).map((row, i) => { const len = (row.visits / total) * C; const el = <circle key={row.name} cx={50} cy={50} r={R} fill="none" stroke={PALETTE[i]} strokeWidth={14} strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-offset} />; offset += len; return el; })}
      </svg>
      <ul className="space-y-1.5 text-sm">{rows.slice(0, 4).map((row, i) => <li key={row.name} className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i] }} /><span className="capitalize">{row.name}</span><span className="text-muted-foreground">{pct(row.visits, total)}%</span></li>)}</ul>
    </div>
  );
}

export function Switcher({ value, onChange, options }: { value: string; onChange: (value: any) => void; options: Array<[string, string]> }) {
  return <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="tablist">{options.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${value === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}</div>;
}

export function CampaignAnalytics({ campaigns }: { campaigns: Row[] }) {
  const [key, setKey] = useState("");
  // A short default period keeps the database aggregation light; longer ranges are opt-in.
  const [days, setDays] = useState(7);
  const [from, setFrom] = useState<"source" | "medium" | "utm" | "referrer" | "link">("source");
  const [place, setPlace] = useState<"city" | "country">("city");
  const [tech, setTech] = useState<"os" | "browser">("os");
  const query = useQuery({
    queryKey: ["qr-admin", "analytics", key, days],
    queryFn: () => apiPost<Row>("/admin/qr", { action: "campaign_analytics", key, days }, true),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const d = query.data;

  const series = useMemo(() => {
    if (!d) return [];
    const byDate = new Map<string, { visits: number; visitors: number }>(d.daily.map((r: Row) => [r.date, r]));
    const end = Date.now();
    return Array.from({ length: days }, (_, i) => {
      const date = dayKey(end - (days - 1 - i) * 86400000);
      const hit = byDate.get(date);
      return { date, visits: hit?.visits ?? 0, visitors: hit?.visitors ?? 0 };
    });
  }, [d, days]);

  const visits: number = d?.totals.visits ?? 0;
  const topSource: Slice | undefined = d?.bySource.find((r: Slice) => r.name !== "(none)");
  const fromRows: Record<typeof from, Slice[]> = d ? { source: d.bySource, medium: d.byMedium, utm: d.byUtmCampaign, referrer: d.byReferrer, link: d.byLink } : ({} as any);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-xs">
          <Select value={key || ALL} onValueChange={v => setKey(v === ALL ? "" : v)}>
            <SelectTrigger aria-label="Link"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All links</SelectItem>
              <SelectItem value="order-online">order-online (landing page)</SelectItem>
              {campaigns.map(row => <SelectItem key={row.key} value={row.key}>{row.key}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Period">
          {DAY_CHOICES.map(n => <button key={n} type="button" role="tab" aria-selected={days === n} onClick={() => setDays(n)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${days === n ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{n === 7 ? "Last 7 days" : `${n} days`}</button>)}
        </div>
      </div>
      {query.error ? <p role="alert" className="text-sm text-destructive">{query.error.message}</p> : null}
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {d ? <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={<Eye className="h-3.5 w-3.5" />} label="Visits" value={visits.toLocaleString()} note={`in the last ${days} days`} spark={series.map(s => s.visits)} />
          <Kpi icon={<Users className="h-3.5 w-3.5" />} label="Unique people" value={d.totals.visitors.toLocaleString()} note={visits ? `${(visits / Math.max(1, d.totals.visitors)).toFixed(1)} visits each` : "none yet"} />
          <Kpi icon={<Repeat className="h-3.5 w-3.5" />} label="Came back" value={`${pct(d.totals.returning, visits)}%`} note={`${d.totals.returning} repeat visits`} />
          <Kpi icon={<TrendingUp className="h-3.5 w-3.5" />} label="Top source" value={<span className="block truncate text-2xl">{topSource?.name ?? "—"}</span>} note={topSource ? `${pct(topSource.visits, visits)}% of visits` : "add a UTM source to a link"} />
        </div>

        <Card title="Visits over time" hint="Days in India time. Hover the chart for exact numbers.">
          {visits === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No visits in this period yet. Open one of your links to see it appear here.</p> : <TrendChart days={series} />}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Where people come from">
            <Switcher value={from} onChange={setFrom} options={[["source", "UTM source"], ["medium", "UTM medium"], ["utm", "UTM campaign"], ["referrer", "Website"], ["link", "Link"]]} />
            <Ranked rows={fromRows[from]} total={visits} empty={from === "referrer" ? "No referrer data: most QR scans and app clicks arrive with none." : "Nothing recorded yet."} />
          </Card>
          <div className="space-y-5">
            <Card title="When they visit" hint="Hour of the day, India time."><HourBars hourly={d.hourly} /></Card>
            <Card title="Devices"><Donut rows={d.byDevice} total={visits} /></Card>
          </div>
          <Card title="Operating system and browser"><Switcher value={tech} onChange={setTech} options={[["os", "Operating system"], ["browser", "Browser"]]} /><Ranked rows={tech === "os" ? d.byOs : d.byBrowser} total={visits} /></Card>
          <Card title="Location" hint="Only available when the site runs on Vercel."><Switcher value={place} onChange={setPlace} options={[["city", "City"], ["country", "Country"]]} /><Ranked rows={(place === "city" ? d.byCity : d.byCountry).filter((r: Slice) => r.name !== "(none)")} total={visits} empty="No location data yet." /></Card>
        </div>

        <details className="rounded-lg border border-border bg-card p-5">
          <summary className="cursor-pointer font-display text-lg">Latest visits ({d.recent.length})</summary>
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground">{["When", "Link", "Source / medium", "From", "Device", "Place"].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead><tbody className="[&_td]:p-2 [&_tr]:border-b">
            {d.recent.map((row: Row, i: number) => <tr key={i}><td className="whitespace-nowrap">{new Date(row.ts).toLocaleString()}</td><td>{row.key}</td><td>{[row.utm_source, row.utm_medium].filter(Boolean).join(" / ") || "—"}</td><td className="break-all">{row.referrerHost || "Direct"}</td><td className="whitespace-nowrap">{row.device} · {row.os}{row.returning ? " · returning" : ""}</td><td>{[row.city, row.country].filter(Boolean).join(", ") || "—"}</td></tr>)}
          </tbody></table></div>
        </details>
        {d.botsExcluded ? <p className="text-xs text-muted-foreground">{d.botsExcluded} automated visits (bots and link previews) are not counted.</p> : null}
      </> : null}
    </div>
  );
}
