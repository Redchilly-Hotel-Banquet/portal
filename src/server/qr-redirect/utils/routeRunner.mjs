export function runRoute(routes, req, res, routeUrl) {
  const route = routes.find((item) => {
    return item.method === req.method && (!routeUrl || item.url === routeUrl)
  })

  if (!route) {
    res.setHeader('Allow', routes.map((item) => item.method).join(', '))
    return res.status(405).json({ error: 'Method not allowed' })
  }

  return route.handler(req, res)
}
