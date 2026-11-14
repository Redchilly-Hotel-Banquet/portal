import getRewardRoutes from '../routes/rewardRoute.mjs'
import { runRoute } from '../utils/routeRunner.mjs'

export default function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const action = url.searchParams.get('action') || 'create'

  return runRoute(getRewardRoutes(), req, res, `/reward/${action}`)
}
