import { updateWhatsappRedirectText } from '../services/whatsappRedirectService.mjs'
import { getUpdateParams } from '../utils/redirectUtils.mjs'

export async function handleWhatsappRedirectUpdate(req, res) {
  try {
    const params = getUpdateParams(req)
    const redirectConfig = await updateWhatsappRedirectText(params)

    return res.status(200).json({
      success: true,
      data: redirectConfig
    })
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message })
    }

    console.error(error)
    return res.status(500).json({ error: 'Unable to update WhatsApp redirect text' })
  }
}
