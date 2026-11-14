import type { Db, MongoClient } from "mongodb";
import { env } from "../../env";
import { mongoConnection } from "../../mongo";
import { r2 } from "../../storage/r2";
import { sql, sqlConfigured, sqlReady } from "../../sql.mjs";

/** MongoDB Atlas free clusters (M0) hold 512 MB. Set DB_CAPACITY_MB if the plan is different. */
const dbCapacityBytes = () => (Number(process.env.DB_CAPACITY_MB?.trim()) || 512) * 1_000_000;
/** Cloudflare R2's free allowance per month: 10 GB stored, 1 million Class A and 10 million Class B requests. */
const r2Limits = () => ({ storageBytes: (Number(process.env.R2_CAPACITY_GB?.trim()) || 10) * 1e9, classA: 1_000_000, classB: 10_000_000 });

const CLASS_A = new Set(["ListBuckets", "PutBucket", "ListObjects", "ListObjectsV2", "PutObject", "CopyObject", "CompleteMultipartUpload", "CreateMultipartUpload", "ListMultipartUploads", "UploadPart", "UploadPartCopy", "ListParts", "PutBucketCors", "PutBucketLifecycleConfiguration", "PutBucketEncryption"]);
const CLASS_B = new Set(["HeadBucket", "HeadObject", "GetObject", "UsageSummary", "GetBucketEncryption", "GetBucketLocation", "GetBucketCors", "GetBucketLifecycleConfiguration"]);

type Collection = { name: string; documents: number; dataBytes: number; indexBytes: number; indexes: number };
type Database = { name: string; bytes: number; dataBytes: number; storageBytes: number; collections: number; indexes: number; usedBySite: boolean };

const stats = async (db: Db) => {
  const s = await db.command({ dbStats: 1, scale: 1 });
  return { name: db.databaseName, bytes: (s.dataSize ?? 0) + (s.indexSize ?? 0), dataBytes: s.dataSize ?? 0, storageBytes: s.storageSize ?? 0, collections: s.collections ?? 0, indexes: s.indexes ?? 0, documents: s.objects ?? 0, indexBytes: s.indexSize ?? 0 };
};

const collectionsOf = async (db: Db): Promise<Collection[]> => {
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith("system."));
  const rows = await Promise.all(
    names.map(async (name): Promise<Collection | null> => {
      try {
        const [r] = await db.collection(name).aggregate([{ $collStats: { storageStats: {}, count: {} } }]).toArray();
        const st = r?.storageStats ?? {};
        return { name, documents: st.count ?? r?.count ?? 0, dataBytes: st.size ?? 0, indexBytes: st.totalIndexSize ?? 0, indexes: Object.keys(st.indexSizes ?? {}).length };
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((r): r is Collection => r !== null).sort((a, b) => b.dataBytes + b.indexBytes - (a.dataBytes + a.indexBytes));
};

/** The portal database. Atlas counts data + indexes across every database on the cluster. */
async function loadDatabase() {
  const client: MongoClient = mongoConnection.getClient();
  const site = mongoConnection.getDb();
  const own = await stats(site);
  const siteNames = new Set([site.databaseName]);

  const databases: Database[] = [];
  try {
    const list = await client.db("admin").admin().command({ listDatabases: 1, nameOnly: true, authorizedDatabases: true });
    await Promise.all(
      (list.databases as { name: string }[]).map(async ({ name }) => {
        try {
          const s = name === site.databaseName ? own : await stats(client.db(name));
          databases.push({ name, bytes: s.bytes, dataBytes: s.dataBytes, storageBytes: s.storageBytes, collections: s.collections, indexes: s.indexes, usedBySite: siteNames.has(name) });
        } catch {
          /* not allowed to read it */
        }
      }),
    );
  } catch {
    /* listing databases is not permitted: fall back to this app's own database */
  }
  if (!databases.some((d) => d.name === site.databaseName)) databases.push({ name: site.databaseName, bytes: own.bytes, dataBytes: own.dataBytes, storageBytes: own.storageBytes, collections: own.collections, indexes: own.indexes, usedBySite: true });
  databases.sort((a, b) => b.bytes - a.bytes);

  return {
    capacityBytes: dbCapacityBytes(),
    usedBytes: databases.reduce((sum, d) => sum + d.bytes, 0),
    siteBytes: databases.filter((d) => d.usedBySite).reduce((sum, d) => sum + d.bytes, 0),
    siteName: site.databaseName,
    databases,
    documents: own.documents,
    dataBytes: own.dataBytes,
    indexBytes: own.indexBytes,
    collections: (await collectionsOf(site)).slice(0, 10),
  };
}

/** Requests this month for the one bucket this app uses, from Cloudflare's analytics. Needs CLOUDFLARE_API_TOKEN (Account Analytics: Read). */
async function loadR2Requests() {
  const token = (process.env.R2_TOKEN_VALUE ?? process.env.CLOUDFLARE_API_TOKEN)?.trim();
  if (!token) return null;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const query = `query ($account: String!, $start: Time!, $end: Time!, $bucket: String!) {
    viewer { accounts(filter: { accountTag: $account }) {
      r2OperationsAdaptiveGroups(limit: 200, filter: { datetime_geq: $start, datetime_leq: $end, bucketName: $bucket }) { sum { requests } dimensions { actionType } }
    } }
  }`;
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { account: env.R2_ACCOUNT_ID, start: start.toISOString(), end: now.toISOString(), bucket: env.R2_BUCKET } }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok || json.errors?.length) return { error: json.errors?.[0]?.message ?? `Cloudflare answered ${res.status}` };
    let classA = 0, classB = 0, total = 0;
    const byAction = new Map<string, number>();
    for (const g of json.data?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups ?? []) {
      const action = g.dimensions?.actionType ?? "unknown";
      const n = g.sum?.requests ?? 0;
      byAction.set(action, (byAction.get(action) ?? 0) + n);
      total += n;
      if (CLASS_A.has(action)) classA += n;
      else if (CLASS_B.has(action)) classB += n;
    }
    // Every kind of request this month, each marked with the class Cloudflare bills it under (deletes are free).
    const kind = (action: string) => (CLASS_A.has(action) ? "A" : CLASS_B.has(action) ? "B" : "Free");
    return { classA, classB, free: total - classA - classB, total, since: start.toISOString(), byAction: [...byAction].map(([action, requests]) => ({ action, requests, class: kind(action) })).sort((a, b) => b.requests - a.requests) };
  } catch (error) {
    return { error: (error as Error).message || "Could not reach Cloudflare" };
  }
}

/** Only the bucket this app is configured to use: the account's other buckets are not read. */
async function loadR2() {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) return { configured: false as const };
  try {
    const [usage, requests] = await Promise.all([r2.usage(), loadR2Requests()]);
    return { configured: true as const, ...usage, requests, limits: r2Limits(), accountId: env.R2_ACCOUNT_ID };
  } catch (error) {
    return { configured: true as const, error: (error as Error).message || "Could not read the bucket" };
  }
}

/** Turso's free plan, per month: 5 GB stored, 500 million rows read, 10 million rows written. */
const sqlLimits = () => ({
  storageBytes: (Number(process.env.TURSO_STORAGE_LIMIT_GB?.trim()) || 5) * 1e9,
  rowsRead: Number(process.env.TURSO_ROWS_READ_LIMIT?.trim()) || 500_000_000,
  rowsWritten: Number(process.env.TURSO_ROWS_WRITTEN_LIMIT?.trim()) || 10_000_000,
});

/** This month's organisation-wide usage from Turso's management API (the organisation is found from the token). */
async function loadSqlPlatform() {
  const token = process.env.APP_TURSO_API_TOKEN?.trim();
  if (!token) return null;
  try {
    const headers = { Authorization: `Bearer ${token}` };
    let org = process.env.TURSO_ORG?.trim();
    if (!org) {
      const list = await (await fetch("https://api.turso.tech/v1/organizations", { headers, signal: AbortSignal.timeout(10000), cache: "no-store" })).json();
      org = Array.isArray(list) ? String(list[0]?.slug ?? "") : "";
    }
    if (!org) return { error: "Could not find the Turso organisation for this token." };
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const res = await fetch(`https://api.turso.tech/v1/organizations/${encodeURIComponent(org)}/usage?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(now.toISOString())}`, { headers, signal: AbortSignal.timeout(10000), cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: (json as { error?: string }).error ?? `Turso answered ${res.status}` };
    const u = (json as { organization?: { usage?: Record<string, number> } })?.organization?.usage ?? {};
    return { org, storageBytes: Number(u.storage_bytes ?? 0), rowsRead: Number(u.rows_read ?? 0), rowsWritten: Number(u.rows_written ?? 0), since: from.toISOString() };
  } catch (error) {
    return { error: (error as Error).message || "Could not reach Turso" };
  }
}

async function loadSql() {
  if (!sqlConfigured()) return { configured: false as const };
  try {
    await sqlReady();
    const db = sql();
    const size = await db.execute("select page_count * page_size as bytes from pragma_page_count, pragma_page_size");
    const list = await db.execute("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name");
    const sizes = new Map<string, number>();
    try {
      for (const r of (await db.execute("select name, sum(pgsize) as bytes from dbstat group by name")).rows) sizes.set(String(r.name), Number(r.bytes));
    } catch {
      /* per-table sizes are not available on every plan; the totals still are */
    }
    const tables = await Promise.all(
      list.rows.map(async (r) => {
        const name = String(r.name);
        const count = await db.execute(`select count(*) as n from "${name.replace(/"/g, '""')}"`);
        return { name, rows: Number(count.rows[0]?.n ?? 0), bytes: sizes.get(name) ?? 0 };
      }),
    );
    return { configured: true as const, fileBytes: Number(size.rows[0]?.bytes ?? 0), tables: tables.sort((a, b) => b.bytes - a.bytes), platform: await loadSqlPlatform(), limits: sqlLimits() };
  } catch (error) {
    return { configured: true as const, error: (error as Error).message.slice(0, 200) };
  }
}

// Listing a bucket counts as storage requests, so keep the readings for a minute; "refresh" reads them again.
let cache: { at: number; value: unknown } | null = null;

export const usageService = {
  async handle(request: { refresh?: boolean }) {
    if (!request?.refresh && cache && Date.now() - cache.at < 60_000) return cache.value;
    const [database, files, turso] = await Promise.all([loadDatabase().catch(() => null), loadR2(), loadSql()]);
    const value = { at: Date.now(), database, files, turso };
    cache = { at: value.at, value };
    return value;
  },
};
