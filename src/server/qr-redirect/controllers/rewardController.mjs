import {
  cleanupRewardRecords,
  createRewardQrRecord,
  getCustomerRewardStatus,
  getRewardOptionsList,
  getRewardRecordStatus,
  verifyRewardQrCode
} from '../services/rewardService.mjs'
import {
  getRewardCleanupParams,
  getRewardCustomerParams,
  getRewardCreateParams,
  getRewardStatusParams,
  getRewardVerifyParams
} from '../utils/rewardUtils.mjs'

export async function createRewardQr(req, res) {
  try {
    const payload = await createRewardQrRecord(getRewardCreateParams(req))
    return res.status(201).json({ success: true, data: payload })
  } catch (error) {
    return sendRewardError(error, res, 'Unable to create reward QR code')
  }
}

export async function verifyRewardQr(req, res) {
  try {
    const payload = await verifyRewardQrCode(getRewardVerifyParams(req))
    return res.status(200).json({ success: true, data: payload })
  } catch (error) {
    return sendRewardError(error, res, 'Unable to verify reward QR code')
  }
}

export async function getRewardStatus(req, res) {
  try {
    const payload = await getRewardRecordStatus(getRewardStatusParams(req))
    return res.status(200).json({ success: true, data: payload })
  } catch (error) {
    return sendRewardError(error, res, 'Unable to get reward status')
  }
}

export async function getRewardCustomer(req, res) {
  try {
    const payload = await getCustomerRewardStatus(getRewardCustomerParams(req))
    return res.status(200).json({ success: true, data: payload })
  } catch (error) {
    return sendRewardError(error, res, 'Unable to get customer reward status')
  }
}

export async function getRewardOptions(req, res) {
  try {
    const payload = await getRewardOptionsList()
    return res.status(200).json({ success: true, data: payload })
  } catch (error) {
    return sendRewardError(error, res, 'Unable to get reward options')
  }
}

export async function cleanupRewards(req, res) {
  try {
    const payload = await cleanupRewardRecords(getRewardCleanupParams(req))
    return res.status(200).json({ success: true, data: payload })
  } catch (error) {
    return sendRewardError(error, res, 'Unable to cleanup reward records')
  }
}

function sendRewardError(error, res, fallbackMessage) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ error: error.message })
  }

  console.error(error)
  return res.status(500).json({ error: fallbackMessage })
}
