import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { getDb } from './mongodb.mjs'
import { HttpError, normalizePhone } from './utils/redirectUtils.mjs'
import { getRewardCollectionName, getRewardCustomerCollectionName, getRewardOptionCollectionName, getUserCollectionName, getRewardCreateParams } from './utils/rewardUtils.mjs'
import { createRewardQrRecord, cleanupRewardRecords, getRewardOptionsList, getCustomerRewardStatus } from './services/rewardService.mjs'
import { CAMPAIGN_COLLECTION } from './config.mjs'
import { campaignAnalytics } from './tracking.mjs'
import { siteAnalytics } from './siteTracking.mjs'
import { getSettings, settingsSchema } from './settings.mjs'

const text = z.string().trim().min(1).max(4000)
const key = z.string().trim().min(1).max(180).regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/, 'Use letters, numbers, hyphens, underscores and optional path segments')
const phone = z.string().transform(normalizePhone).pipe(z.string().regex(/^\d{8,15}$/, 'Enter a valid phone number with country code'))
const utm = z.string().trim().max(80).regex(/^[a-zA-Z0-9_.\- ]*$/, 'UTM values may use letters, numbers, spaces, dots, hyphens and underscores').default('')
const destination = z.string().trim().max(500).refine(value => !value || /^https?:\/\//i.test(value) || value.startsWith('/'), 'The destination must start with https:// or /').default('')
// "whatsapp" opens a chat with a ready message; "tracking" only records where visitors came from, then sends them on.
const campaignSchema = z.object({ type: z.enum(['whatsapp', 'tracking']).default('whatsapp'), key, phone: z.string().default(''), text: z.string().trim().max(4000).default(''), destination, active: z.boolean(), utm_source: utm, utm_medium: utm, utm_campaign: utm }).superRefine((value, ctx) => {
  if (value.type === 'whatsapp') {
    if (!/^\d{8,15}$/.test(normalizePhone(value.phone))) ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number with country code' })
    if (!value.text) ctx.addIssue({ code: 'custom', message: 'Enter the WhatsApp message' })
  } else if (!value.utm_source || !value.utm_medium) ctx.addIssue({ code: 'custom', message: 'A tracking campaign needs a UTM source and a UTM medium' })
}).transform(value => value.type === 'whatsapp' ? { ...value, phone: normalizePhone(value.phone), destination: '' } : { ...value, phone: '', text: '' })
const optionSchema = z.object({ key, label: text, active: z.boolean() })
const pendingSchema = z.object({
  code: text, orderId: text, customerName: z.string().trim().max(200),
  phone: z.union([z.literal(''), phone]), source: text,
  expiresAt: z.coerce.date().refine(date => date > new Date(), 'Expiry must be in the future'),
  rewardConfig: z.object({ mode: z.enum(['discount', 'visits']), discountType: z.enum(['price', 'percentage']), discountValue: z.coerce.number().positive().max(100000), visitTarget: z.coerce.number().int().min(1).max(1000), rewardOption: z.string().max(180) })
}).superRefine((value, ctx) => {
  if (value.rewardConfig.mode === 'visits' && !value.phone) ctx.addIssue({ code: 'custom', message: 'Phone is required for visit rewards' })
  if (value.rewardConfig.discountType === 'percentage' && value.rewardConfig.discountValue > 100) ctx.addIssue({ code: 'custom', message: 'Percentage cannot exceed 100' })
})
function parse(schema, data) {
  const result = schema.safeParse(data)
  if (!result.success) throw new HttpError(400, result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}
async function requireChanged(result) {
  if (!result.matchedCount && !result.deletedCount) throw new HttpError(404, 'Record no longer exists or cannot be edited')
}

export async function manageQr(body, request, user) {
  if (!user?.roles?.includes('admin') || !user?.outlets?.includes('all')) throw new HttpError(403, 'An administrator with access to all branches is required to manage shared QR campaigns')
  const db = await getDb()
  const campaigns = db.collection(CAMPAIGN_COLLECTION)
  const options = db.collection(getRewardOptionCollectionName())
  const rewards = db.collection(getRewardCollectionName())
  const customers = db.collection(getRewardCustomerCollectionName())
  // who changed it: the account's _id
  const audit = { updatedAt: new Date(), updatedBy: /^[0-9a-f]{24}$/i.test(String(user.id)) ? new ObjectId(String(user.id)) : user.id }
  switch (body?.action) {
    case 'load': {
      const [campaignList, optionList, settings] = await Promise.all([
        campaigns.find({}, { projection: { _id: 0 } }).sort({ key: 1 }).limit(500).toArray(),
        options.find({}, { projection: { _id: 0 } }).sort({ label: 1 }).limit(500).toArray(), getSettings()
      ])
      return { campaigns: campaignList, options: optionList, settings }
    }
    case 'save_campaign': {
      const data = parse(campaignSchema, body.data)
      const originalKey = body.originalKey ? parse(key, body.originalKey) : null
      if (!originalKey || originalKey !== data.key) {
        if (await campaigns.findOne({ key: data.key })) throw new HttpError(409, 'A campaign with this key already exists')
      }
      if (originalKey) await requireChanged(await campaigns.updateOne({ key: originalKey }, { $set: { ...data, ...audit } }))
      else await campaigns.insertOne({ ...data, createdAt: new Date(), ...audit })
      return { success: true }
    }
    case 'campaign_analytics':
      return campaignAnalytics({ key: body.key ? parse(key, body.key) : '', days: parse(z.coerce.number().int().min(1).max(90), body.days || 7) })
    case 'site_analytics':
      return siteAnalytics({ days: parse(z.coerce.number().int().min(1).max(90), body.days || 7), campaign: body.campaign ? parse(key, body.campaign) : '' })
    case 'delete_campaign':
      await requireChanged(await campaigns.deleteOne({ key: parse(key, body.key) }))
      return { success: true }
    case 'save_option': {
      const data = parse(optionSchema, body.data)
      if (body.originalKey) {
        if (data.key !== body.originalKey) throw new HttpError(400, 'Reward option keys cannot be renamed')
        await requireChanged(await options.updateOne({ key: data.key }, { $set: { ...data, ...audit } }))
      } else {
        if (await options.findOne({ key: data.key })) throw new HttpError(409, 'A reward option with this key already exists')
        await options.insertOne({ ...data, ...audit, createdAt: new Date() })
      }
      return { success: true }
    }
    case 'delete_option':
      // Do not silently recreate defaults after an administrator deletes them.
      await db.collection('qr_settings').updateOne({ key: 'settings' }, { $set: { rewardOptionsEdited: true } }, { upsert: true })
      await requireChanged(await options.deleteOne({ key: parse(key, body.key) }))
      return { success: true }
    case 'save_settings': {
      const settings = parse(settingsSchema, body.data)
      await db.collection('qr_settings').updateOne({ key: 'settings' }, { $set: { ...settings, ...audit } }, { upsert: true })
      return { settings }
    }
    case 'generate': {
      const url = new URL('/reward/create', request.url)
      for (const [name, value] of Object.entries(body.data || {})) if (value !== '' && value != null) url.searchParams.set(name, String(value))
      const params = getRewardCreateParams({ url: url.href, headers: { host: url.host, 'x-forwarded-proto': url.protocol.slice(0, -1) }, qrAdmin: true })
      parse(pendingSchema, { ...params, code: 'new', orderId: params.orderId || 'new', expiresAt: params.expiresAt || new Date(Date.now() + 86400000), rewardConfig: { mode: params.rewardMode, discountType: params.discountType, discountValue: params.discountValue || 10, visitTarget: params.visitTarget || 5, rewardOption: params.rewardOption || '' } })
      if (params.rewardOption && !await options.findOne({ key: params.rewardOption, active: { $ne: false } })) throw new HttpError(400, 'Choose an active reward option')
      return { data: await createRewardQrRecord(params) }
    }
    case 'list_rewards': {
      const query = {}
      if (body.status) query.status = parse(z.enum(['pending', 'verified', 'redeeming', 'cancelled']), body.status)
      if (body.search) query.$or = ['code', 'orderId', 'phone'].map(field => ({ [field]: String(body.search).trim() }))
      const offset = parse(z.coerce.number().int().min(0).max(100000), body.offset || 0)
      const records = await rewards.find(query, { projection: { _id: 0 } }).sort({ createdAt: -1 }).skip(offset).limit(50).toArray()
      return { records, hasMore: records.length === 50 }
    }
    case 'save_reward': {
      const data = parse(pendingSchema, body.data)
      const { code, ...changes } = data
      const option = changes.rewardConfig.rewardOption ? await options.findOne({ key: changes.rewardConfig.rewardOption, active: { $ne: false } }) : null
      if (changes.rewardConfig.rewardOption && !option) throw new HttpError(400, 'Choose an active reward option')
      changes.rewardConfig.rewardOptionLabel = option?.label || ''
      await requireChanged(await rewards.updateOne({ code, status: 'pending' }, { $set: { ...changes, ...audit } }))
      return { success: true }
    }
    case 'cancel_reward':
      await requireChanged(await rewards.updateOne({ code: parse(text, body.code), status: 'pending' }, { $set: { status: 'cancelled', ...audit } }))
      return { success: true }
    case 'delete_reward':
      await requireChanged(await rewards.deleteOne({ code: parse(text, body.code), status: { $ne: 'redeeming' } }))
      return { success: true }
    case 'list_customers': {
      const query = body.phone ? { phone: parse(phone, body.phone) } : {}
      const offset = parse(z.coerce.number().int().min(0).max(100000), body.offset || 0)
      return { customers: await customers.find(query, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).skip(offset).limit(50).toArray() }
    }
    case 'customer':
      return { customer: await getCustomerRewardStatus({ phone: parse(phone, body.phone) }) }
    case 'save_customer': {
      const data = parse(z.object({ phone, customerName: z.string().trim().max(200), visitCount: z.coerce.number().int().min(0).max(100000), totalVisits: z.coerce.number().int().min(0).max(100000), activeVisitTarget: z.coerce.number().int().min(0).max(1000) }).refine(value => value.totalVisits >= value.visitCount, 'Total visits must be at least the current visit count'), body.data)
      await requireChanged(await customers.updateOne({ phone: data.phone }, { $set: { ...data, ...audit } }))
      await db.collection(getUserCollectionName()).updateOne({ phone: data.phone }, { $set: { name: data.customerName, ...audit } })
      return { success: true }
    }
    case 'cleanup':
      return { result: await cleanupRewardRecords({ force: body.force === true }) }
    case 'seed_options':
      return { options: await getRewardOptionsList(true) }
    default:
      throw new HttpError(400, 'Unknown QR management action')
  }
}
