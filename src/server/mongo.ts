import { MongoClient, Db } from "mongodb";
import { env } from "./env";

type Cache = { client: MongoClient | null; db: Db | null; pending: Promise<Db> | null };

// Reused across hot reloads and warm serverless invocations.
const globalCache = globalThis as unknown as { __redchillyMongo?: Cache };
const cache: Cache = (globalCache.__redchillyMongo ??= { client: null, db: null, pending: null });

export const mongoConnection = {
  async connect(): Promise<Db> {
    if (cache.db) return cache.db;
    cache.pending ??= (async () => {
      const client = new MongoClient(env.MONGO_DB_URI, { maxPoolSize: 10 });
      await client.connect();
      cache.client = client;
      cache.db = client.db(env.MONGO_DB_NAME);
      return cache.db;
    })().catch((error) => {
      cache.pending = null;
      throw error;
    });
    return cache.pending;
  },

  getDb(): Db {
    if (!cache.db) throw new Error("Database not connected");
    return cache.db;
  },
};
