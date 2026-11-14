import { getSettings } from '../settings.mjs'
import crypto from 'node:crypto'
import QRCode from 'qrcode'
import { getDb } from '../mongodb.mjs'
import {
  getRewardCustomerCollectionName,
  getRewardCollectionName,
  getRewardOptionCollectionName,
  getRewardOptions,
  getRewardPublicBaseUrl,
  getUserCollectionName,
  HttpError,
  isDevelopmentMode
} from '../utils/rewardUtils.mjs'

export async function createRewardQrRecord({
  orderId,
  phone,
  source,
  customerName,
  rewardMode,
  discountType,
  discountValue,
  visitTarget,
  rewardOption,
  expiresAt: requestedExpiresAt,
  baseUrl
}) {
  const db = await getDb()
  const collection = db.collection(getRewardCollectionName())
  const customerCollection = db.collection(getRewardCustomerCollectionName())
  const rewardOptionCollection = db.collection(getRewardOptionCollectionName())
  const userCollection = db.collection(getUserCollectionName())
  await ensureRewardIndexes(collection)
  await ensureRewardCustomerIndexes(customerCollection)
  await ensureRewardOptionIndexes(rewardOptionCollection)
  await ensureUserIndexes(userCollection)
  await seedRewardOptionsIfNeeded(rewardOptionCollection)
  await cleanupRewardRecords({})

  const code = crypto.randomUUID()
  const now = new Date()
  const settings = await getSettings()
  const expiresAt = requestedExpiresAt || new Date(now.getTime() + settings.expiryDays * 86400000)
  const normalizedOrderId = orderId || `RC-${now.getTime()}`
  const user = phone
    ? await upsertUserOnQrGeneration(userCollection, {
        phone,
        customerName,
        orderId: normalizedOrderId,
        source,
        now
      })
    : null
  const customer = phone
    ? await upsertCustomerOnQrGeneration(customerCollection, {
        phone,
        customerName: customerName || user?.name || '',
        orderId: normalizedOrderId,
        source,
        now
      })
    : null
  const selectedRewardOption = rewardOption
    ? await rewardOptionCollection.findOne({ key: rewardOption, active: { $ne: false } })
    : null
  const rewardConfig = buildRewardConfig({
    rewardMode,
    discountType,
    discountValue,
    visitTarget,
    rewardOption,
    selectedRewardOption,
    customer
  })
  const publicBaseUrl = (settings.publicBaseUrl || getRewardPublicBaseUrl(baseUrl)).replace(/\/+$/, '')
  const verifyUrl = `${publicBaseUrl}/reward/verify?code=${encodeURIComponent(code)}`
  const qrImage = await QRCode.toDataURL(verifyUrl, {
    margin: 1,
    width: 320,
    color: {
      dark: '#5d070c',
      light: '#fff9ef'
    }
  })

  const record = {
    code,
    orderId: normalizedOrderId,
    phone,
    source,
    customerName,
    rewardConfig,
    visitCount: 0,
    verifyUrl,
    status: 'pending',
    createdAt: now,
    expiresAt
  }

  await collection.insertOne(record)

  return {
    code,
    orderId: normalizedOrderId,
    phone,
    source,
    customerName: customerName || user?.name || '',
    rewardConfig,
    customer: buildCustomerPreview(customer, rewardConfig),
    user: buildUserPreview(user),
    visitCount: record.visitCount,
    status: record.status,
    expiresAt,
    verifyUrl,
    qrImage,
    isDevelopment: isDevelopmentMode()
  }
}

export async function verifyRewardQrCode({ code }) {
  const db = await getDb()
  const collection = db.collection(getRewardCollectionName())
  const customerCollection = db.collection(getRewardCustomerCollectionName())
  await ensureRewardIndexes(collection)
  await ensureRewardCustomerIndexes(customerCollection)

  const now = new Date()
  const record = await collection.findOne({
    code,
    status: 'pending'
  })

  if (!record) {
    throw new HttpError(404, 'Reward QR code was not found or was already used')
  }

  if (record.expiresAt && record.expiresAt <= now) {
    await collection.deleteOne({ _id: record._id })
    throw new HttpError(410, 'Reward QR code has expired')
  }

  const reward = await pickReward(record.rewardConfig)
  // A QR can be scanned by multiple clients at once. Claim it atomically
  // before updating visits so only one request can award the reward.
  const claimed = await collection.findOneAndUpdate(
    { _id: record._id, status: 'pending', $or: [
      { expiresAt: { $gt: new Date() } },
      { expiresAt: { $exists: false } }
    ] },
    { $set: { status: 'redeeming', redeemingAt: now } },
    { returnDocument: 'after' }
  )
  if (!claimed) {
    throw new HttpError(409, 'Reward QR code was already used or has expired')
  }
  const visitState = await updateCustomerVisitState(customerCollection, record, reward)
  const verifiedRecord = {
    status: 'verified',
    verifiedAt: now,
    reward,
    visitCount: visitState.visitCount,
    totalVisits: visitState.totalVisits,
    visitRewardUnlocked: visitState.unlocked
  }

  const { deleteOnVerify } = await getSettings()
  if (deleteOnVerify) {
    await collection.deleteOne({ _id: record._id })
  } else {
    await collection.updateOne({ _id: record._id }, { $set: verifiedRecord })
  }

  return {
    orderId: record.orderId,
    source: record.source,
    status: 'verified',
    reward,
    rewardConfig: record.rewardConfig,
    customer: visitState,
    deleted: deleteOnVerify,
    isDevelopment: isDevelopmentMode()
  }
}

export async function getRewardOptionsList(forceSeed = false) {
  const db = await getDb()
  const collection = db.collection(getRewardOptionCollectionName())
  await ensureRewardOptionIndexes(collection)
  await seedRewardOptionsIfNeeded(collection, forceSeed)

  return collection
    .find(
      { active: { $ne: false } },
      {
        projection: {
          _id: 0,
          key: 1,
          label: 1
        }
      }
    )
    .sort({ label: 1 })
    .toArray()
}

export async function getRewardRecordStatus({ code, orderId }) {
  const db = await getDb()
  const collection = db.collection(getRewardCollectionName())
  await ensureRewardIndexes(collection)

  const query = code ? { code } : { orderId }
  const record = await collection.findOne(query, {
    projection: {
      _id: 0,
      code: 1,
      orderId: 1,
      phone: 1,
      source: 1,
      customerName: 1,
      status: 1,
      reward: 1,
      rewardConfig: 1,
      visitCount: 1,
      createdAt: 1,
      expiresAt: 1,
      verifiedAt: 1
    }
  })

  if (!record) {
    throw new HttpError(404, 'Reward record was not found')
  }

  return record
}

export async function getCustomerRewardStatus({ phone }) {
  const db = await getDb()
  const collection = db.collection(getRewardCustomerCollectionName())
  const userCollection = db.collection(getUserCollectionName())
  await ensureRewardCustomerIndexes(collection)
  await ensureUserIndexes(userCollection)

  const customer = await collection.findOne(
    { phone },
    {
      projection: {
        _id: 0,
        phone: 1,
        customerName: 1,
        visitCount: 1,
        totalVisits: 1,
        totalQrGenerated: 1,
        memberSince: 1,
        rewardsUnlocked: 1,
        lastVisitAt: 1,
        lastQrGeneratedAt: 1,
        lastOrderId: 1,
        lastSource: 1,
        qrHistory: 1,
        rewardHistory: 1,
        activeVisitTarget: 1,
        activeRewardOption: 1
      }
    }
  )

  if (!customer) {
    throw new HttpError(404, 'Customer reward record was not found')
  }

  const user = await userCollection.findOne(
    { phone },
    {
      projection: {
        _id: 0,
        phone: 1,
        name: 1,
        memberSince: 1,
        totalQrGenerated: 1,
        firstQrGeneratedAt: 1,
        lastQrGeneratedAt: 1,
        lastOrderId: 1,
        lastSource: 1,
        sourceStats: 1,
        orderHistory: 1,
        createdAt: 1,
        updatedAt: 1
      }
    }
  )

  return {
    ...customer,
    user: user || null
  }
}

export async function cleanupRewardRecords({ force = false } = {}) {
  const db = await getDb()
  const collection = db.collection(getRewardCollectionName())
  await ensureRewardIndexes(collection)

  const now = new Date()
  const expired = await collection.deleteMany({
    $or: [
      { expiresAt: { $lte: now } },
      { status: { $in: ['verified', 'cancelled', 'unwanted'] } }
    ]
  })

  let overflowDeleted = 0
  const { maxRecords } = await getSettings()
  const recordCount = await collection.countDocuments()

  if (force || recordCount > maxRecords) {
    const excess = force ? recordCount : recordCount - maxRecords
    const oldRecords = await collection
      .find({}, { projection: { _id: 1 } })
      .sort({ createdAt: 1 })
      .limit(excess)
      .toArray()

    if (oldRecords.length > 0) {
      const result = await collection.deleteMany({
        _id: { $in: oldRecords.map((record) => record._id) }
      })
      overflowDeleted = result.deletedCount
    }
  }

  return {
    expiredDeleted: expired.deletedCount,
    overflowDeleted,
    maxRecords
  }
}

async function ensureRewardIndexes(collection) {
  await collection.createIndex({ code: 1 }, { unique: true })
  await collection.createIndex({ orderId: 1 })
  await collection.createIndex({ status: 1, expiresAt: 1 })
}

async function ensureRewardCustomerIndexes(collection) {
  await collection.createIndex({ phone: 1 }, { unique: true })
}

async function ensureUserIndexes(collection) {
  await collection.createIndex({ phone: 1 }, { unique: true })
  await collection.createIndex({ updatedAt: -1 })
}

async function ensureRewardOptionIndexes(collection) {
  await collection.createIndex({ key: 1 }, { unique: true })
  await collection.createIndex({ active: 1, label: 1 })
}

async function seedRewardOptionsIfNeeded(collection, forceSeed = false) {
  const count = await collection.estimatedDocumentCount()

  if (count > 0) {
    return
  }

  const db = await getDb()
  const saved = await db.collection('qr_settings').findOne({ key: 'settings' })
  if (saved?.rewardOptionsEdited && !forceSeed) return

  const now = new Date()
  const options = getRewardOptions().map((label) => ({
    key: toRewardOptionKey(label),
    label,
    active: true,
    createdAt: now,
    updatedAt: now
  }))

  if (options.length > 0) {
    await collection.insertMany(options, { ordered: false })
  }
}

async function pickReward(rewardConfig) {
  if (rewardConfig?.rewardOptionLabel) {
    return rewardConfig.rewardOptionLabel
  }

  const options = await getRewardOptionsList()

  if (options.length === 0) {
    return 'Surprise gift at the counter'
  }

  const index = crypto.randomInt(0, options.length)
  return options[index].label
}

function buildRewardConfig({
  rewardMode,
  discountType,
  discountValue,
  visitTarget,
  rewardOption,
  selectedRewardOption,
  customer
}) {
  const mode = rewardMode === 'visits' ? 'visits' : 'discount'

  if (mode === 'visits') {
    const activeVisitTarget = Number(customer?.activeVisitTarget || 0)
    const currentVisitCount = Number(customer?.visitCount || 0)
    const shouldContinueActiveCycle = activeVisitTarget > 0 && currentVisitCount > 0 && currentVisitCount < activeVisitTarget

    return {
      mode,
      visitTarget: shouldContinueActiveCycle ? activeVisitTarget : Number(visitTarget || 5),
      rewardOption: shouldContinueActiveCycle ? customer.activeRewardOption?.key || rewardOption : rewardOption,
      rewardOptionLabel: shouldContinueActiveCycle
        ? customer.activeRewardOption?.label || ''
        : selectedRewardOption?.label || '',
      continuedActiveCycle: shouldContinueActiveCycle,
      startingVisitCount: currentVisitCount
    }
  }

  return {
    mode,
    discountType: discountType === 'price' ? 'price' : 'percentage',
    discountValue: Number(discountValue || 10),
    rewardOption,
    rewardOptionLabel: selectedRewardOption?.label || ''
  }
}

async function updateCustomerVisitState(collection, record, reward) {
  if (!record.phone) {
    return {
      phone: '',
      visitCount: 0,
      totalVisits: 0,
      visitTarget: Number(record.rewardConfig?.visitTarget || 0),
      unlocked: false,
      reward: record.rewardConfig?.mode === 'discount' ? reward : null
    }
  }

  const now = new Date()
  const currentCustomer = await collection.findOne({ phone: record.phone })
  const currentVisitCount = Number(currentCustomer?.visitCount || 0)
  const currentTotalVisits = Number(currentCustomer?.totalVisits || 0)
  const visitTarget = Number(record.rewardConfig?.visitTarget || 0)
  const nextTotalVisits = currentTotalVisits + 1
  let nextVisitCount = currentVisitCount + 1
  let unlocked = false

  if (record.rewardConfig?.mode === 'visits' && visitTarget > 0 && nextVisitCount >= visitTarget) {
    unlocked = true
    nextVisitCount = nextVisitCount - visitTarget
  }

  const rewardHistoryItem = unlocked
    ? {
        reward,
        unlockedAt: now,
        orderId: record.orderId,
        source: record.source,
        visitTarget
      }
    : null

  const update = {
    $set: {
      phone: record.phone,
      customerName: record.customerName || currentCustomer?.customerName || '',
      visitCount: nextVisitCount,
      totalVisits: nextTotalVisits,
      activeVisitTarget: record.rewardConfig?.mode === 'visits' && !unlocked ? visitTarget : 0,
      activeRewardOption: record.rewardConfig?.mode === 'visits' && !unlocked
        ? {
            key: record.rewardConfig?.rewardOption || '',
            label: reward
          }
        : null,
      lastVisitAt: now,
      updatedAt: now
    },
    $setOnInsert: {
      createdAt: now,
      memberSince: now
    }
  }

  if (rewardHistoryItem) {
    update.$push = {
      rewardHistory: {
        $each: [rewardHistoryItem],
        $slice: -25
      }
    }
    update.$inc = { rewardsUnlocked: 1 }
  }

  await collection.updateOne({ phone: record.phone }, update, { upsert: true })

  return {
    phone: record.phone,
    customerName: record.customerName || currentCustomer?.customerName || '',
    visitCount: nextVisitCount,
    totalVisits: nextTotalVisits,
    visitTarget,
    cycleCompletedCount: Math.floor(nextTotalVisits / (visitTarget || 1)),
    cycleStatus: unlocked ? 'reset' : 'in_progress',
    unlocked,
    reward: unlocked || record.rewardConfig?.mode === 'discount' ? reward : null
  }
}

async function upsertCustomerOnQrGeneration(collection, { phone, customerName, orderId, source, now }) {
  await ensureRewardCustomerIndexes(collection)

  const currentCustomer = await collection.findOne({ phone })
  const resolvedCustomerName = customerName || currentCustomer?.customerName || ''
  const qrHistoryItem = {
    orderId,
    source,
    generatedAt: now
  }

  const update = {
    $set: {
      phone,
      customerName: resolvedCustomerName,
      lastOrderId: orderId,
      lastSource: source,
      lastQrGeneratedAt: now,
      updatedAt: now
    },
    $setOnInsert: {
      createdAt: now,
      memberSince: now,
      visitCount: 0,
      totalVisits: 0,
      rewardsUnlocked: 0
    },
    $inc: {
      totalQrGenerated: 1
    },
    $push: {
      qrHistory: {
        $each: [qrHistoryItem],
        $slice: -25
      }
    }
  }

  await collection.updateOne({ phone }, update, { upsert: true })

  return collection.findOne({ phone })
}

async function upsertUserOnQrGeneration(collection, { phone, customerName, orderId, source, now }) {
  await ensureUserIndexes(collection)

  const currentUser = await collection.findOne({ phone })
  const resolvedName = customerName || currentUser?.name || ''
  const orderHistoryItem = {
    orderId,
    source,
    generatedAt: now
  }
  const sourceKey = sanitizeMongoPath(source || 'manual')

  const update = {
    $set: {
      phone,
      name: resolvedName,
      lastOrderId: orderId,
      lastSource: source,
      lastQrGeneratedAt: now,
      updatedAt: now
    },
    $setOnInsert: {
      createdAt: now,
      memberSince: now,
      firstQrGeneratedAt: now
    },
    $inc: {
      totalQrGenerated: 1,
      [`sourceStats.${sourceKey}`]: 1
    },
    $push: {
      orderHistory: {
        $each: [orderHistoryItem],
        $slice: -50
      }
    }
  }

  await collection.updateOne({ phone }, update, { upsert: true })

  return collection.findOne({ phone })
}

function toRewardOptionKey(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildCustomerPreview(customer, rewardConfig) {
  const visitTarget = Number(rewardConfig?.visitTarget || customer?.activeVisitTarget || 0)
  const visitCount = Number(customer?.visitCount || 0)
  const totalVisits = Number(customer?.totalVisits || 0)

  return {
    phone: customer?.phone || '',
    customerName: customer?.customerName || '',
    visitCount,
    totalVisits,
    totalQrGenerated: Number(customer?.totalQrGenerated || 0),
    rewardsUnlocked: Number(customer?.rewardsUnlocked || 0),
    memberSince: customer?.memberSince || customer?.createdAt || null,
    lastQrGeneratedAt: customer?.lastQrGeneratedAt || null,
    lastOrderId: customer?.lastOrderId || '',
    lastSource: customer?.lastSource || '',
    completedTargetCount: visitTarget > 0 ? Math.floor(totalVisits / visitTarget) : Number(customer?.rewardsUnlocked || 0),
    activeVisitTarget: visitTarget,
    activeRewardOption: customer?.activeRewardOption || null,
    cycleStatus: visitTarget > 0 && visitCount > 0 && visitCount < visitTarget ? 'in_progress' : 'not_started',
    cycleReset: visitTarget > 0 && visitCount === 0 && totalVisits > 0,
    remainingVisits: visitTarget > 0 ? Math.max(visitTarget - visitCount, 0) : 0,
    qrHistory: customer?.qrHistory || [],
    rewardHistory: customer?.rewardHistory || []
  }
}

function buildUserPreview(user) {
  if (!user) {
    return null
  }

  return {
    phone: user.phone || '',
    name: user.name || '',
    memberSince: user.memberSince || user.createdAt || null,
    totalQrGenerated: Number(user.totalQrGenerated || 0),
    firstQrGeneratedAt: user.firstQrGeneratedAt || null,
    lastQrGeneratedAt: user.lastQrGeneratedAt || null,
    lastOrderId: user.lastOrderId || '',
    lastSource: user.lastSource || '',
    sourceStats: user.sourceStats || {},
    orderHistory: user.orderHistory || []
  }
}

function sanitizeMongoPath(value) {
  return String(value || 'manual').replace(/[.$]/g, '_')
}
