import { MongoClient } from 'mongodb'

// The QR tools use the portal's own database.
const cache = globalThis.__redchillyQrMongo ??= new Map()

export async function getDb() {
  const uri = process.env.MONGO_DB_URI
  const database = process.env.MONGO_DB_NAME
  if (!uri || !database) throw new Error('Missing MONGO_DB_URI or MONGO_DB_NAME')
  const key = JSON.stringify([uri, database])
  if (!cache.has(key)) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000
    })
    cache.set(key, client.connect().catch(error => {
      cache.delete(key)
      throw error
    }))
  }
  return (await cache.get(key)).db(database)
}
