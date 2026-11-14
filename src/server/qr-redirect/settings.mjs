import { z } from 'zod'
import { getDb } from './mongodb.mjs'

const publicUrl = z.string().max(2000).refine(value => !value || /^https?:\/\//.test(value), 'Use an http:// or https:// URL')
export const settingsSchema = z.object({
  expiryDays: z.coerce.number().min(1).max(365),
  maxRecords: z.coerce.number().int().min(1).max(100000),
  deleteOnVerify: z.boolean(),
  /** true: anyone opening a reward's link redeems it. false: only staff with the Loyalty rewards role, using the scanner. */
  publicScan: z.boolean(),
  publicBaseUrl: publicUrl,
  zomatoUrl: publicUrl.refine(Boolean, 'Zomato URL is required'),
  swiggyUrl: publicUrl.refine(Boolean, 'Swiggy URL is required'),
  shareMessage: z.string().trim().min(1).max(4000)
}).strict()

export async function getSettings() {
  const db = await getDb()
  const saved = await db.collection('qr_settings').findOne({ key: 'settings' })
  const defaults = {
    expiryDays: Number(process.env.REWARD_EXPIRY_MS || 2592000000) / 86400000,
    maxRecords: Number(process.env.REWARD_MAX_RECORDS || 5000),
    deleteOnVerify: process.env.REWARD_DELETE_ON_VERIFY !== 'false',
    publicScan: true,
    publicBaseUrl: '',
    zomatoUrl: 'https://zomato.onelink.me/xqzv/vqlkfw8m',
    swiggyUrl: 'https://www.swiggy.com/menu/119900?source=sharing',
    shareMessage: 'Hi {customerName}, your Red Chilly reward for order {orderId} is ready! Scan your QR or open {verifyUrl}'
  }
  return Object.fromEntries(Object.keys(defaults).map(key => [key, saved?.[key] ?? defaults[key]]))
}
