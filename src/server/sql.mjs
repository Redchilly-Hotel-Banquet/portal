import { createClient } from "@libsql/client";

/**
 * Turso (libSQL, SQLite) connection, for the data SQL handles better than MongoDB: append-only event logs that are
 * summed and grouped (campaign visits). Everything else stays in MongoDB. Optional: when the two variables below are
 * not set, the features that use it fall back to MongoDB.
 */
const url = () => process.env.APP_TURSO_URL?.trim();
const token = () => process.env.APP_TURSO_TOKEN?.trim();

export const sqlConfigured = () => Boolean(url() && token());

const globalCache = globalThis

/** @returns {import("@libsql/client").Client} */
export const sql = () => {
  if (!sqlConfigured()) throw new Error("The SQL database is not configured.");
  return (globalCache.__redchillySql ??= createClient({ url: url(), authToken: token() }));
};

/** Creates the tables and indexes if they are missing. Safe to call on every request; it runs once per process. */
export const sqlReady = () =>
  (globalCache.__redchillySqlReady ??= (async () => {
    const db = sql();
    await db.batch(
      [
        `create table if not exists campaign_visits (
          id integer primary key autoincrement,
          key text not null,
          kind text not null default 'campaign',
          ts integer not null,
          utm_source text not null default '',
          utm_medium text not null default '',
          utm_campaign text not null default '',
          visitor_id text not null,
          is_returning integer not null default 0,
          ip_hash text not null default '',
          referrer text not null default '',
          referrer_host text not null default '',
          country text not null default '',
          region text not null default '',
          city text not null default '',
          user_agent text not null default '',
          device text not null default '',
          os text not null default '',
          browser text not null default '',
          is_bot integer not null default 0
        )`,
        "create index if not exists campaign_visits_key_ts on campaign_visits (key, ts)",
        "create index if not exists campaign_visits_ts on campaign_visits (ts)",
      ],
      "write",
    );
  })().catch((error) => {
    globalCache.__redchillySqlReady = undefined;
    throw error;
  }));
