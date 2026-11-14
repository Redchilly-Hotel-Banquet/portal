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
import { renderRewardPage } from '../views/rewardPage.mjs'
import { getSettings } from '../settings.mjs'

export async function createRewardQr(req, res) {
  try {
    const payload = await createRewardQrRecord(getRewardCreateParams(req))
    return res.status(201).json({ success: true, data: payload })
  } catch (error) {
    return sendRewardError(error, res, 'Unable to create reward QR code')
  }
}

/** A browser opening the QR link gets a readable page; anything else (the admin tools, tests, scripts) gets JSON as before. */
const wantsPage = req => String(req.headers?.accept || '').includes('text/html') && !String(req.url || '').includes('format=json')

export async function verifyRewardQr(req, res) {
  try {
    // When scanning from anywhere is switched off, opening the link does not redeem it: staff use the scanner.
    if (!(await getSettings()).publicScan) {
      if (wantsPage(req)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        return res.status(403).send(renderRewardPage({ staffOnly: true }))
      }
      return res.status(403).json({ error: 'This reward can only be redeemed by our staff. Please show the QR to them.' })
    }
    const payload = await verifyRewardQrCode(getRewardVerifyParams(req))
    if (wantsPage(req)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.status(200).send(renderRewardPage({ data: payload }))
    }
    return res.status(200).json({ success: true, data: payload })
  } catch (error) {
    if (wantsPage(req)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.status(error.statusCode || 500).send(renderRewardPage({ error: error.statusCode ? error.message : 'Unable to open this reward', statusCode: error.statusCode || 500 }))
    }
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
