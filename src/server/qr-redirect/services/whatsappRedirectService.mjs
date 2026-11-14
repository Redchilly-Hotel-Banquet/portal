import { CAMPAIGN_COLLECTION } from '../config.mjs'
import { getDb } from '../mongodb.mjs'
import { buildWhatsappUrl, HttpError, normalizePhone } from '../utils/redirectUtils.mjs'

export async function getWhatsappRedirectUrl(key, onFound, origin = '') {
  const redirectConfig = await findActiveRedirectConfig(key)

  if (!redirectConfig) {
    throw new HttpError(404, `No active WhatsApp redirect found for key "${key}"`)
  }

  onFound?.(redirectConfig)
  if (redirectConfig.type === 'tracking') {
    // No chat to open: send the visitor on, carrying the UTM values so other analytics tools see them too.
    const target = new URL(redirectConfig.destination || '/', origin || 'http://localhost')
    for (const name of ['utm_source', 'utm_medium', 'utm_campaign']) {
      if (redirectConfig[name] && !target.searchParams.has(name)) target.searchParams.set(name, redirectConfig[name])
    }
    return target.toString()
  }
  const phone = normalizePhone(redirectConfig.phone)
  const text = String(redirectConfig.text || '').trim()

  if (!phone || !text) {
    throw new HttpError(500, 'Redirect config must include both phone and text')
  }

  return buildWhatsappUrl({ phone, text })
}

export async function updateWhatsappRedirectText({ key, text }) {
  const db = await getDb()
  const collectionName = getRedirectCollectionName()
  const now = new Date()

  const result = await db.collection(collectionName).findOneAndUpdate(
    {
      key,
      active: { $ne: false }
    },
    {
      $set: {
        text,
        updatedAt: now
      }
    },
    {
      returnDocument: 'after',
      projection: {
        _id: 0,
        key: 1,
        phone: 1,
        text: 1,
        active: 1,
        updatedAt: 1
      }
    }
  )

  if (!result) {
    throw new HttpError(404, `No active WhatsApp redirect found for key "${key}"`)
  }

  return result
}

async function findActiveRedirectConfig(key) {
  const db = await getDb()
  const collectionName = getRedirectCollectionName()

  return db.collection(collectionName).findOne({
    key,
    active: { $ne: false }
  })
}

function getRedirectCollectionName() {
  return CAMPAIGN_COLLECTION
}
