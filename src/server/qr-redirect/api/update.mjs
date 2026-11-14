import getWhatsappRedirectUpdateRoutes from '../routes/whatsappRedirectUpdateRoute.mjs'
import { runRoute } from '../utils/routeRunner.mjs'

export default function handler(req, res) {
  return runRoute(getWhatsappRedirectUpdateRoutes(), req, res, '/update')
}
