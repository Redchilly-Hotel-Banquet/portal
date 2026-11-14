import { HttpError, normalizePhone } from './redirectUtils.mjs'

const DEFAULT_REWARD_COLLECTION = 'reward_qr_codes'
const DEFAULT_REWARD_CUSTOMER_COLLECTION = 'reward_customers'
const DEFAULT_REWARD_OPTION_COLLECTION = 'reward_options'
const DEFAULT_USER_COLLECTION = 'users'
const DEFAULT_REWARD_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_REWARD_MAX_RECORDS = 5000
const DEFAULT_REWARDS = [
  'Free dessert on your next order',
  '10% off on your next visit',
  'Free soft drink with your next meal',
  'Surprise gift at the counter'
]

export { HttpError }

export function getRewardCreateParams(req) {
  assertAdminToken(req)

  const url = getRequestUrl(req)
  const expiresAt = parseExpiryDate(getOptionalParam(url, 'expiresAt'))
  const rewardMode = getOptionalParam(url, 'rewardMode') || 'discount'
  const phone = normalizePhone(getOptionalParam(url, 'phone'))

  if (rewardMode === 'visits' && !phone) {
    throw new HttpError(400, 'Phone number is required for visit tracker rewards')
  }

  return {
    orderId: getOptionalParam(url, 'orderId'),
    phone,
    source: getOptionalParam(url, 'source') || 'manual',
    customerName: getOptionalParam(url, 'customerName'),
    rewardMode,
    discountType: getOptionalParam(url, 'discountType') || 'percentage',
    discountValue: getOptionalParam(url, 'discountValue'),
    visitTarget: getOptionalParam(url, 'visitTarget'),
    rewardOption: getOptionalParam(url, 'rewardOption'),
    expiresAt,
    baseUrl: getRequestBaseUrl(req)
  }
}

export function getRewardVerifyParams(req) {
  const url = getRequestUrl(req)
  return {
    code: getRequiredParam(url, 'code')
  }
}

export function getRewardStatusParams(req) {
  assertAdminToken(req)

  const url = getRequestUrl(req)
  const code = getOptionalParam(url, 'code')
  const orderId = getOptionalParam(url, 'orderId')

  if (!code && !orderId) {
    throw new HttpError(400, 'Missing required query parameter: code or orderId')
  }

  return { code, orderId }
}

export function getRewardCustomerParams(req) {
  assertAdminToken(req)

  const url = getRequestUrl(req)
  return {
    phone: getRequiredParam(url, 'phone')
  }
}

export function getRewardCleanupParams(req) {
  assertAdminToken(req)
  const url = getRequestUrl(req)

  return {
    force: url.searchParams.get('force') === 'true'
  }
}

export function getRewardCollectionName() {
  return process.env.REWARD_COLLECTION || DEFAULT_REWARD_COLLECTION
}

export function getRewardCustomerCollectionName() {
  return process.env.REWARD_CUSTOMER_COLLECTION || DEFAULT_REWARD_CUSTOMER_COLLECTION
}

export function getRewardOptionCollectionName() {
  return process.env.REWARD_OPTION_COLLECTION || DEFAULT_REWARD_OPTION_COLLECTION
}

export function getUserCollectionName() {
  return process.env.USER_COLLECTION || DEFAULT_USER_COLLECTION
}

export function getRewardExpiryMs() {
  return Number(process.env.REWARD_EXPIRY_MS || DEFAULT_REWARD_EXPIRY_MS)
}

export function getRewardMaxRecords() {
  return Number(process.env.REWARD_MAX_RECORDS || DEFAULT_REWARD_MAX_RECORDS)
}

export function getRewardDeleteOnVerify() {
  return process.env.REWARD_DELETE_ON_VERIFY !== 'false'
}

export function getRewardOptions() {
  const rewards = String(process.env.REWARD_OPTIONS || '')
    .split('|')
    .map((reward) => reward.trim())
    .filter(Boolean)

  return rewards.length > 0 ? rewards : DEFAULT_REWARDS
}

export function isDevelopmentMode() {
  return (process.env.VERCEL_ENV || process.env.NODE_ENV) !== 'production'
}

export function getRewardPublicBaseUrl(fallbackBaseUrl) {
  const baseUrl =
    process.env.VERCEL_ENV === 'production'
      ? process.env.PROD_PUBLIC_BASE_URL
      : process.env.DEV_PUBLIC_BASE_URL

  return String(baseUrl || process.env.PUBLIC_BASE_URL || process.env.APP_URL || fallbackBaseUrl || '').replace(/\/+$/, '')
}

function assertAdminToken(req) {
  if (req.qrAdmin !== true) throw new HttpError(401, 'Portal administrator authorization required')
}

function getRequestUrl(req) {
  return new URL(req.url, getRequestBaseUrl(req))
}

function getRequestBaseUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'https'
  return `${protocol}://${req.headers.host || 'localhost'}`
}

function getRequiredParam(url, key) {
  const value = getOptionalParam(url, key)

  if (!value) {
    throw new HttpError(400, `Missing required query parameter: ${key}`)
  }

  return value
}

function getOptionalParam(url, key) {
  return String(url.searchParams.get(key) || '').trim()
}

function parseExpiryDate(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'Invalid expiresAt date')
  }

  return date
}
