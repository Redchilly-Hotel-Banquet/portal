const DEFAULT_CAMPAIGN_KEY = 'order-qr-code-reward'
const WHATSAPP_SEND_URL = 'https://api.whatsapp.com/send'

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
  }
}

export function getCampaignKey(req) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`)
  return url.searchParams.get('key') || process.env.DEFAULT_CAMPAIGN_KEY || DEFAULT_CAMPAIGN_KEY
}

export function getUpdateParams(req) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`)
  const key = String(url.searchParams.get('key') || '').trim()
  const text = String(url.searchParams.get('text') || '').trim()
  if (req.qrAdmin !== true) throw new HttpError(401, 'Portal administrator authorization required')

  if (!key) {
    throw new HttpError(400, 'Missing required query parameter: key')
  }

  if (!text) {
    throw new HttpError(400, 'Missing required query parameter: text')
  }

  return { key, text }
}

/**
 * A phone number as digits that start with the country code ("919876543210"). That is how reward customers and WhatsApp
 * campaigns are keyed. An Indian number typed without its code (10 digits starting 6 to 9, or 0 and 10 digits) is read
 * as +91, so the same person is never counted twice.
 */
export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`
  return digits
}

export function buildWhatsappUrl({ phone, text }) {
  const redirectUrl = new URL(WHATSAPP_SEND_URL)
  redirectUrl.searchParams.set('phone', phone)
  redirectUrl.searchParams.set('text', text)

  return redirectUrl.toString()
}
