import { HttpError } from './utils/redirectUtils.mjs'
import { verifyRewardQrCode } from './services/rewardService.mjs'

const CODE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/**
 * Redeems a reward QR for a signed-in member of staff (the dashboard scanner). The scanner reads the QR's link; the
 * code is taken out of it, so a pasted link or a bare code both work. Works whatever the "anyone can scan" setting is.
 */
export async function scanReward(body, user) {
  const code = String(body?.code ?? '').match(CODE)?.[0]?.toLowerCase()
  if (!code) throw new HttpError(400, 'That is not a Red Chilly reward QR code.')
  return verifyRewardQrCode({ code, scannedBy: { id: user.id, name: user.name } })
}
