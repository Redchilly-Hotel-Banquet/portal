"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Eye, MousePointerClick, Radio, Repeat, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiPost } from "@/lib/apiClient";
import { Card, DAY_CHOICES, Donut, HourBars, Kpi, Ranked, Switcher, TrendChart, dayKey, pct, type Slice } from "./campaign-analytics";

type Row = Record<string, any>;
const ALL = "__all__";
const seconds = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}m ${n % 60}s` : `${n}s`);

/** Everyone who visits the website, from any source, plus the campaign links and QR codes that bring them. */
export function WebsiteAnalytics({ campaigns }: { campaigns: Row[] }) {
  const [campaign, setCampaign] = useState("");
  const [days, setDays] = useState(7);
  const [from, setFrom] = useState<"channel" | "source" | "medium" | "utm" | "referrer" | "qr">("channel");
  const [who, setWho] = useState<"device" | "os" | "browser" | "language" | "screen">("device");
  const [place, setPlace] = useState<"city" | "country">("city");
  const query = useQuery({
    queryKey: ["qr-admin", "site-analytics", campaign, days],
    queryFn: () => apiPost<Row>("/admin/qr", { action: "site_analytics", campaign, days }, true),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const d = query.data;
  const series = useMemo(() => {
    if (!d) return [];
    const byDate = new Map<string, Row>(d.daily.map((r: Row) => [r.date, r]));
    const end = Date.now();
    return Array.from({ length: days }, (_, i) => {
      const date = dayKey(end - (days - 1 - i) * 86400000);
      const hit = byDate.get(date);
      return { date, visits: hit?.sessions ?? 0, visitors: hit?.visitors ?? 0 };
    });
  }, [d, days]);
  const visits: number = d?.totals.visits ?? 0;
  const fromRows: Record<typeof from, Slice[]> = d ? { channel: d.byChannel, source: d.bySource, medium: d.byMedium, utm: d.byUtmCampaign, referrer: d.byReferrer, qr: d.byQr } : ({} as any);
  const whoRows: Record<typeof who, Slice[]> = d ? { device: d.byDevice, os: d.byOs, browser: d.byBrowser, language: d.byLanguage, screen: d.byScreen } : ({} as any);
  const campaignNames = Array.from(new Set(campaigns.map((c) => c.key)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-xs">
          <Select value={campaign || ALL} onValueChange={(v) => setCampaign(v === ALL ? "" : v)}>
            <SelectTrigger aria-label="Campaign"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All visitors</SelectItem>{campaignNames.map((key) => <SelectItem key={key} value={key}>Campaign: {key}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Period">
          {DAY_CHOICES.map((n) => <button key={n} type="button" role="tab" aria-selected={days === n} onClick={() => setDays(n)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${days === n ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{n === 7 ? "Last 7 days" : `${n} days`}</button>)}
        </div>
      </div>
      {query.error ? <p role="alert" className="text-sm text-destructive">{query.error.message}</p> : null}
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {d ? <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={<Eye className="h-3.5 w-3.5" />} label="Visits" value={visits.toLocaleString()} note={`${d.totals.pageviews.toLocaleString()} page views`} spark={series.map((s) => s.visits)} />
          <Kpi icon={<Users className="h-3.5 w-3.5" />} label="Unique visitors" value={d.totals.visitors.toLocaleString()} note={`${d.totals.newVisitors} new · ${d.totals.returning} returning`} />
          <Kpi icon={<Repeat className="h-3.5 w-3.5" />} label="Left after one page" value={`${d.totals.bounceRate}%`} note={`${d.totals.pagesPerVisit} pages per visit`} />
          <Kpi icon={<Clock className="h-3.5 w-3.5" />} label="Time on a page" value={d.totals.avgSeconds ? seconds(d.totals.avgSeconds) : "—"} note="average, when the page was left" />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><Radio className="h-3.5 w-3.5 text-primary" aria-hidden />On the site now (last 5 minutes): <strong className="text-foreground">{d.now}</strong></span>
          <span>QR and campaign link opens: <strong className="text-foreground">{d.qrOpens.opens}</strong> by {d.qrOpens.people} {d.qrOpens.people === 1 ? "person" : "people"} (see the QR and link results tab)</span>
          <span className="flex items-center gap-1.5"><MousePointerClick className="h-3.5 w-3.5 text-primary" aria-hidden />Clicks and actions: <strong className="text-foreground">{d.totals.events}</strong></span>
        </div>

        <Card title="Visits over time" hint="A visit is one person's run of page views. Days in India time. Hover for exact numbers.">
          {visits === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No website visits recorded in this period yet. Website tracking starts once this version is live and people browse the site; earlier QR and link opens are on the QR and link results tab.</p> : <TrendChart days={series} />}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Where visitors come from" hint="Each visit counted once, by how it started.">
            <Switcher value={from} onChange={setFrom} options={[["channel", "Channel"], ["source", "UTM source"], ["medium", "UTM medium"], ["utm", "UTM campaign"], ["referrer", "Website"], ["qr", "QR / link"]]} />
            <Ranked rows={fromRows[from]} total={visits} empty="Nothing recorded yet." />
          </Card>
          <Card title="Campaigns" hint="Opens of each campaign link or QR code, and what those visitors then did on the website.">
            {d.campaigns.length === 0 ? <p className="text-sm text-muted-foreground">No campaign traffic yet. Share a campaign link or add UTM tags to a link.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground">{["Campaign", "Link opens", "Site visits", "People", "Page views", "Actions"].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead><tbody className="[&_td]:p-2 [&_tr]:border-b">
                {d.campaigns.map((c: Row) => <tr key={c.name}><td className="break-all font-medium">{c.name}</td><td className="tabular-nums">{c.scans}</td><td className="tabular-nums">{c.visits}</td><td className="tabular-nums">{c.visitors}</td><td className="tabular-nums">{c.pageviews}</td><td className="tabular-nums">{c.events}</td></tr>)}
              </tbody></table></div>
            )}
          </Card>
          <Card title="Most viewed pages" hint="Page views, with the average time spent and how far down people scroll.">
            {d.pages.length === 0 ? <p className="text-sm text-muted-foreground">Nothing recorded yet.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground">{["Page", "Views", "People", "Avg time", "Scrolled"].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead><tbody className="[&_td]:p-2 [&_tr]:border-b">
                {d.pages.map((p: Row) => <tr key={p.name}><td className="break-all font-medium">{p.name}</td><td className="tabular-nums">{p.visits}</td><td className="tabular-nums">{p.visitors}</td><td className="tabular-nums">{p.avgSeconds ? seconds(p.avgSeconds) : "—"}</td><td className="tabular-nums">{p.scroll ? `${p.scroll}%` : "—"}</td></tr>)}
              </tbody></table></div>
            )}
          </Card>
          <Card title="Entry pages" hint="The first page of each visit."><Ranked rows={d.landingPages} total={visits} /></Card>
          <Card title="Clicks and actions" hint="Calls, WhatsApp, e-mail, outbound links and tracked buttons."><Ranked rows={d.events} total={d.totals.events} empty="No clicks recorded yet." /></Card>
          <div className="space-y-5">
            <Card title="When they visit" hint="Hour of the day a visit started, India time."><HourBars hourly={d.hourly} /></Card>
            <Card title="Devices"><Donut rows={d.byDevice} total={visits} /></Card>
          </div>
          <Card title="Visitors"><Switcher value={who} onChange={setWho} options={[["device", "Device"], ["os", "Operating system"], ["browser", "Browser"], ["language", "Language"], ["screen", "Screen"]]} /><Ranked rows={whoRows[who]} total={visits} /></Card>
          <Card title="Location" hint="Only available when the site runs on Vercel."><Switcher value={place} onChange={setPlace} options={[["city", "City"], ["country", "Country"]]} /><Ranked rows={(place === "city" ? d.byCity : d.byCountry).filter((r: Slice) => r.name !== "(none)")} total={visits} empty="No location data yet." /></Card>
        </div>

        <details className="rounded-lg border border-border bg-card p-5">
          <summary className="cursor-pointer font-display text-lg">Latest page views ({d.recent.length})</summary>
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground">{["When", "Page", "Channel", "Source / campaign", "From", "Device", "Place", "Time"].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead><tbody className="[&_td]:p-2 [&_tr]:border-b">
            {d.recent.map((r: Row, i: number) => <tr key={i}><td className="whitespace-nowrap">{new Date(r.ts).toLocaleString()}</td><td className="break-all">{r.path}{r.landing ? <span className="ml-1 text-xs text-muted-foreground">(entry{r.isNew ? ", new" : ""})</span> : null}</td><td>{r.channel}</td><td>{[r.source, r.campaign].filter(Boolean).join(" · ") || "—"}</td><td className="break-all">{r.referrer || "Direct"}</td><td className="whitespace-nowrap">{r.device} · {r.os}</td><td>{[r.city, r.country].filter(Boolean).join(", ") || "—"}</td><td>{r.seconds ? seconds(r.seconds) : "—"}</td></tr>)}
          </tbody></table></div>
        </details>
        <p className="text-xs text-muted-foreground">Automated visits (bots, link previews) and the admin screens are not counted{d.botsExcluded ? `: ${d.botsExcluded} bot visits left out` : ""}. Visitors are counted by a cookie on their device; no names, phone numbers or IP addresses are stored. {pct(d.totals.newVisitors, Math.max(1, d.totals.newVisitors + d.totals.returning))}% of visits were from new visitors.{d.truncated ? " This period has more activity than can be shown, so the figures cover the most recent part." : ""}</p>
      </> : null}
    </div>
  );
}
