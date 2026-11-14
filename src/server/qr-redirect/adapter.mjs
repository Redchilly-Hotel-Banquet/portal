import getHandler from './api/get.mjs'
import rewardHandler from './api/reward.mjs'
import updateHandler from './api/update.mjs'
import { requireQrAdmin } from './security.mjs'
import { handleRootRedirect } from './controllers/whatsappRedirectController.mjs'

// Adapt the original serverless handlers without changing their public contracts.
export async function adaptHandler(request, handler, configureUrl = () => {}, qrAdmin = false) {
  const url = new URL(request.url)
  configureUrl(url)
  const headers = Object.fromEntries(request.headers)
  headers.host = url.host
  headers['x-forwarded-proto'] = url.protocol.slice(0, -1)
  let body
  if (request.method === 'POST') {
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON request body' }, { status: 400 })
    }
  }
  const responseHeaders = new Headers({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  })
  let status = 200
  let response
  const res = {
    setHeader(name, value) { responseHeaders.set(name, value); return res },
    appendCookie(value) { responseHeaders.append('Set-Cookie', value); return res },
    status(value) { status = value; return res },
    json(value) {
      responseHeaders.set('Content-Type', 'application/json; charset=utf-8')
      response = new Response(JSON.stringify(value), { status, headers: responseHeaders })
      return response
    },
    send(value) {
      response = new Response(value, { status, headers: responseHeaders })
      return response
    },
    redirect(code, location) {
      status = code
      responseHeaders.set('Location', location)
      return res.send(null)
    }
  }
  await handler({ url: url.toString(), method: request.method, headers, body, qrAdmin }, res)
  if (!response) throw new Error('QR handler did not send a response')
  return response
}

export const get = request => adaptHandler(request, getHandler, url => {
  // Only /order-online serves the old root landing page. Never let a query
  // parameter accidentally turn a printed campaign URL into the landing page.
  url.searchParams.delete('root')
})
async function protectedHandler(request, handler, configureUrl) {
  const denied = await requireQrAdmin(request)
  if (denied) return denied
  return adaptHandler(request, handler, configureUrl, true)
}
export const reward = request => {
  const action = new URL(request.url).searchParams.get('action') || 'create'
  return ['verify', 'options'].includes(action)
    ? adaptHandler(request, rewardHandler)
    : protectedHandler(request, rewardHandler)
}
export const auth = () => Response.json({ error: 'Use your portal administrator session. Separate QR logins have been removed.' }, { status: 410 })
export const update = request => protectedHandler(request, updateHandler)
export const host = request => Response.redirect(new URL('/admin/rewards?tab=generate', request.url), 307)
export const cleanup = request => Response.redirect(new URL('/admin/rewards?tab=cleanup', request.url), 307)
export const orderOnline = request => adaptHandler(request, handleRootRedirect)

export async function rewardAction(request, context) {
  const { action } = await context.params
  if (!['create', 'verify', 'status', 'customer', 'options', 'cleanup'].includes(action)) {
    return Response.json({ error: 'Unknown reward action' }, { status: 404 })
  }
  return ['verify', 'options'].includes(action)
    ? adaptHandler(request, rewardHandler, url => url.searchParams.set('action', action))
    : protectedHandler(request, rewardHandler, url => url.searchParams.set('action', action))
}

export async function campaign(request, context) {
  const { campaign } = await context.params
  return adaptHandler(request, getHandler, url => {
    url.searchParams.delete('root')
    url.searchParams.set('key', campaign.join('/'))
  })
}
