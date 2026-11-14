import getWhatsappRedirectRoutes from '../routes/whatsappRedirectRoute.mjs'
import { runRoute } from '../utils/routeRunner.mjs'

export default function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (url.searchParams.get('root') === 'true') {
    return runRoute(getWhatsappRedirectRoutes(), req, res, '/')
  }

  if (url.searchParams.has('key')) {
    return runRoute(getWhatsappRedirectRoutes(), req, res, '/:key*')
  }

  return runRoute(getWhatsappRedirectRoutes(), req, res, '/get')
}
