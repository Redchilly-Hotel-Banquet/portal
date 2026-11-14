import { getWhatsappRedirectUrl } from '../services/whatsappRedirectService.mjs'
import { getCampaignKey } from '../utils/redirectUtils.mjs'
import { recordVisit } from '../tracking.mjs'
import { renderRootPage } from '../views/rootPage.mjs'

export async function handleRootRedirect(req, res) {
  const { getSettings } = await import('../settings.mjs')
  const { zomatoUrl, swiggyUrl } = await getSettings()
  // URLs are rendered into HTML attributes, so escape them even after validation.
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  await recordVisit(req, res, { key: 'order-online', kind: 'landing' })
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(200).send(renderRootPage({ zomatoUrl: escape(zomatoUrl), swiggyUrl: escape(swiggyUrl) }))
}

export async function handleWhatsappRedirect(req, res) {
  try {
    const key = getCampaignKey(req)
    let config
    const redirectUrl = await getWhatsappRedirectUrl(key, found => { config = found }, `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host || 'localhost'}`)
    await recordVisit(req, res, { key, config })

    return res.redirect(302, redirectUrl)
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message })
    }

    console.error(error)
    return res.status(500).json({ error: 'Unable to build WhatsApp redirect' })
  }
}
