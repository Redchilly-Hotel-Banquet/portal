"use client";

import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/apiClient";

type Row = Record<string, any>;
const KEY = ["storage-usage"];

// Decimal units (1 MB = 1,000,000 bytes), as the MongoDB Atlas and Cloudflare dashboards use, so figures compare directly.
const bytes = (n: number) => (n < 1000 ? `${n} B` : n < 1e6 ? `${(n / 1e3).toFixed(2)} kB` : n < 1e9 ? `${(n / 1e6).toFixed(2)} MB` : `${(n / 1e9).toFixed(2)} GB`);
const num = (n: number) => n.toLocaleString("en-IN");
const tone = (pct: number) => (pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-primary");

function Panel({ title, links, children }: { title: string; links?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <h2 className="font-display text-xl">{title}</h2>
        {links}
      </div>
      <div className="space-y-6 p-5">{children}</div>
    </section>
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{children}<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>;
}

function Meter({ label, used, limit, text }: { label: string; used: number; limit: number; text: string }) {
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="font-medium">{label}</span><span className="text-muted-foreground">{text} · {pct < 0.1 && used > 0 ? "<0.1" : pct.toFixed(1)}%</span></div>
      <div role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${tone(pct)}`} style={{ width: `${Math.max(pct, used > 0 ? 0.6 : 0)}%` }} /></div>
    </div>
  );
}

function Table({ head, children }: { head: Array<[string, boolean?]>; children: ReactNode }) {
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[24rem] text-sm">
      <thead className="text-left text-xs text-muted-foreground"><tr>{head.map(([h, right]) => <th key={h} className={`py-2 font-medium ${right ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-border [&_td:not(:first-child)]:text-right [&_td:not(:first-child)]:tabular-nums [&_td]:py-2">{children}</tbody>
    </table></div>
  );
}

function Database({ d }: { d: Row | null }) {
  if (!d) return <p className="text-sm text-muted-foreground">Database details are unavailable right now.</p>;
  const pct = Math.min(100, (d.usedBytes / d.capacityBytes) * 100);
  const sitePct = Math.min(100, (d.siteBytes / d.capacityBytes) * 100);
  const othersBytes = d.usedBytes - d.siteBytes;
  return <>
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="font-display text-3xl">{pct.toFixed(1)}% <span className="font-sans text-base font-normal text-muted-foreground">full</span></p>
        <p className="text-sm text-muted-foreground">{bytes(d.usedBytes)} of {bytes(d.capacityBytes)} used · {bytes(Math.max(0, d.capacityBytes - d.usedBytes))} free</p>
      </div>
      <div role="progressbar" aria-label="Database storage used" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone(pct)}`} style={{ width: `${Math.max(sitePct, 0.4)}%` }} title="This portal" />
        {othersBytes > 0 && <div className="h-full bg-muted-foreground/40" style={{ width: `${Math.min(100 - sitePct, (othersBytes / d.capacityBytes) * 100)}%` }} title="Other databases on the cluster" />}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i className={`h-2.5 w-2.5 rounded-sm ${tone(pct)}`} /> This portal {bytes(d.siteBytes)} ({sitePct.toFixed(1)}%)</span>
        {othersBytes > 0 && <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/40" /> Other databases on the cluster {bytes(othersBytes)}</span>}
      </p>
      {pct >= 70 && <p className="mt-3 text-sm text-amber-600">{pct >= 90 ? "Almost full: upgrade the database plan or clear old data soon." : "Getting full: plan to upgrade or clear old data."}</p>}
    </div>
    <dl className="grid gap-4 text-sm sm:grid-cols-3">
      {([["Documents", num(d.documents)], ["Data", bytes(d.dataBytes)], ["Indexes", bytes(d.indexBytes)]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k} in “{d.siteName}”</dt><dd className="font-medium">{v}</dd></div>)}
    </dl>
    {d.databases.length > 1 && <Table head={[["Databases on this cluster"], ["Data + indexes", true], ["Data", true], ["On disk", true], ["Collections", true]]}>
      {d.databases.map((x: Row) => <tr key={x.name}><td>{x.name} {x.usedBySite && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">this portal</span>}</td><td className="font-medium">{bytes(x.bytes)}</td><td>{bytes(x.dataBytes)}</td><td>{bytes(x.storageBytes)}</td><td>{x.collections}</td></tr>)}
    </Table>}
    {d.collections.length > 0 && <Table head={[["Largest collections"], ["Documents", true], ["Data", true], ["Indexes", true]]}>
      {d.collections.map((c: Row) => <tr key={c.name}><td>{c.name}</td><td>{num(c.documents)}</td><td>{bytes(c.dataBytes)}</td><td>{bytes(c.indexBytes)} <span className="text-muted-foreground">({c.indexes})</span></td></tr>)}
    </Table>}
  </>;
}

function Sql({ t }: { t: Row | undefined }) {
  if (!t?.configured) return <p className="text-sm text-muted-foreground">The SQL database isn't connected. Set <code>APP_TURSO_URL</code> and <code>APP_TURSO_TOKEN</code>. Until then visit tracking is kept in MongoDB.</p>;
  if (t.error) return <p className="text-sm text-destructive">Couldn't read the SQL database: {t.error}</p>;
  const p = t.platform;
  const ok = p && !p.error;
  return <>
    <div className="space-y-4">
      <Meter label="Storage (this database)" used={t.fileBytes} limit={t.limits.storageBytes} text={`${bytes(t.fileBytes)} of ${bytes(t.limits.storageBytes)}`} />
      {ok && <>
        <Meter label="Storage (whole organisation)" used={p.storageBytes} limit={t.limits.storageBytes} text={`${bytes(p.storageBytes)} of ${bytes(t.limits.storageBytes)}`} />
        <Meter label="Rows read this month" used={p.rowsRead} limit={t.limits.rowsRead} text={`${num(p.rowsRead)} of ${num(t.limits.rowsRead)}`} />
        <Meter label="Rows written this month" used={p.rowsWritten} limit={t.limits.rowsWritten} text={`${num(p.rowsWritten)} of ${num(t.limits.rowsWritten)}`} />
      </>}
    </div>
    {p === null && <p className="text-sm text-muted-foreground">Monthly rows read and written aren't shown yet. Set <code>APP_TURSO_API_TOKEN</code> to show them.</p>}
    {p?.error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">Couldn't read monthly usage from Turso: {p.error}</p>}
    {t.tables.length > 0 ? <Table head={[["Tables"], ["Rows", true], ["Size", true]]}>
      {t.tables.map((x: Row) => <tr key={x.name}><td>{x.name}</td><td>{num(x.rows)}</td><td>{x.bytes ? bytes(x.bytes) : "—"}</td></tr>)}
    </Table> : <p className="text-sm text-muted-foreground">No tables yet. They are created when the first campaign visit is recorded.</p>}
  </>;
}

function Files({ f }: { f: Row | undefined }) {
  if (!f?.configured) return <p className="text-sm text-muted-foreground">File storage isn't configured. Set <code>R2_ACCOUNT_ID</code>, <code>R2_ACCESS_KEY_ID</code>, <code>R2_SECRET_ACCESS_KEY</code> and <code>R2_BUCKET</code>.</p>;
  if (f.error) return <p className="text-sm text-destructive">Couldn't read the bucket: {f.error}. Check the R2 credentials and try again.</p>;
  const r = f.requests;
  const ok = r && !r.error;
  return <>
    <p className="text-sm text-muted-foreground">Bucket <strong className="text-foreground">{f.bucket}</strong>: the only bucket this portal uses. The account's other buckets are not read.</p>
    <div className="space-y-4">
      <Meter label="Storage" used={f.bytes} limit={f.limits.storageBytes} text={`${bytes(f.bytes)}${f.truncated ? "+" : ""} of ${bytes(f.limits.storageBytes)} · ${num(f.objects)}${f.truncated ? "+" : ""} files`} />
      {ok && <>
        <Meter label="Class A requests this month (uploads, listings)" used={r.classA} limit={f.limits.classA} text={`${num(r.classA)} of ${num(f.limits.classA)}`} />
        <Meter label="Class B requests this month (downloads, lookups)" used={r.classB} limit={f.limits.classB} text={`${num(r.classB)} of ${num(f.limits.classB)}`} />
      </>}
    </div>
    {f.truncated && <p className="text-xs text-muted-foreground">The bucket is very large, so only the first files were counted and the real total is higher.</p>}
    {r === null && <p className="text-sm text-muted-foreground">Request counts aren't shown yet. To show them, create a Cloudflare API token with <em>Account → Account Analytics → Read</em> and set it as <code>R2_TOKEN_VALUE</code>.</p>}
    {r?.error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">Couldn't read request counts from Cloudflare: {r.error}</p>}
    {f.folders.length > 0 && <Table head={[["Folders in the bucket"], ["Files", true], ["Size", true]]}>
      {f.folders.slice(0, 10).map((x: Row) => <tr key={x.name}><td>{x.name}</td><td>{num(x.objects)}</td><td>{bytes(x.bytes)}</td></tr>)}
    </Table>}
    {ok && <dl className="grid gap-4 text-sm sm:grid-cols-4">
      {([["All requests this month", num(r.total)], ["Class A (writes, listings)", num(r.classA)], ["Class B (reads)", num(r.classB)], ["Free (deletes)", num(r.free)]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-display text-xl">{v}</dd></div>)}
    </dl>}
    {ok && r.byAction.length > 0 && <Table head={[["Requests this month, by type"], ["Class", true], ["Count", true]]}>
      {r.byAction.map((x: Row) => <tr key={x.action}><td>{x.action}</td><td>{x.class}</td><td>{num(x.requests)}</td></tr>)}
    </Table>}
  </>;
}

export function UsagePanel() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: () => apiPost<Row>("/admin/usage", {}, true), staleTime: 60_000, refetchOnWindowFocus: false });
  const refresh = useQuery({ queryKey: [...KEY, "refresh"], enabled: false, queryFn: async () => { const data = await apiPost<Row>("/admin/usage", { refresh: true }, true); queryClient.setQueryData(KEY, data); return data; } });
  const d = query.data;
  const busy = query.isFetching || refresh.isFetching;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">How full the database and file storage are.{d ? ` Read at ${new Date(d.at).toLocaleTimeString()}; kept for a minute.` : ""}</p>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh.refetch()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh</Button>
      </div>
      {query.error ? <p role="alert" className="text-sm text-destructive">{query.error.message}</p> : null}
      {query.isLoading ? <p className="text-sm text-muted-foreground">Reading storage…</p> : null}
      {d && <>
        <Panel title="Database (MongoDB Atlas)" links={<span className="flex gap-4"><Link href="https://cloud.mongodb.com">Open dashboard</Link><Link href="https://www.mongodb.com/pricing">Pricing</Link></span>}>
          <Database d={d.database} />
          <p className="text-xs text-muted-foreground">Sizes use the same units as Atlas. The bar counts data plus indexes across every database on the cluster, as Atlas does. Capacity is {d.database ? bytes(d.database.capacityBytes) : "512 MB"} (the free tier); set <code>DB_CAPACITY_MB</code> if your plan is larger.</p>
        </Panel>
        <Panel title="SQL database (Turso)" links={<span className="flex gap-4"><Link href="https://app.turso.tech">Open dashboard</Link><Link href="https://turso.tech/pricing">Pricing</Link></span>}>
          <Sql t={d.turso} />
          <p className="text-xs text-muted-foreground">Holds campaign visit tracking, which is summed and grouped far faster in SQL. Limits are Turso's free plan (5 GB, 500 million rows read, 10 million rows written a month); set <code>TURSO_STORAGE_LIMIT_GB</code>, <code>TURSO_ROWS_READ_LIMIT</code> or <code>TURSO_ROWS_WRITTEN_LIMIT</code> if your plan differs.</p>
        </Panel>
        <Panel title="File storage (Cloudflare R2)" links={d.files?.configured && !d.files.error ? <span className="flex gap-4"><Link href={`https://dash.cloudflare.com/${d.files.accountId}/r2/default/buckets/${encodeURIComponent(d.files.bucket)}`}>Open bucket</Link><Link href="https://developers.cloudflare.com/r2/pricing/">Pricing</Link></span> : undefined}>
          <Files f={d.files} />
          <p className="text-xs text-muted-foreground">Limits are Cloudflare's monthly free allowance: 10 GB stored, 1 million Class A and 10 million Class B requests. Set <code>R2_CAPACITY_GB</code> if your plan differs. Reading this panel lists the bucket, which counts as a few Class A requests.</p>
        </Panel>
      </>}
    </div>
  );
}
