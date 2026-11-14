import { createHash, randomUUID } from 'node:crypto'
import { VISITS_COLLECTION } from './config.mjs'
import { getDb } from './mongodb.mjs'
import { sql, sqlConfigured, sqlReady } from '../sql.mjs'

const VISITS = () => VISITS_COLLECTION
const COOKIE = 'rc_vid'
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|axios|headless|monitor|uptime/i
let indexed
const clean = (value, max = 120) => String(value || '').trim().slice(0, max)

export function parseUserAgent(ua = '') {
  const device = /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|android|iphone/i.test(ua) ? 'mobile' : 'desktop'
  const os = /iphone|ipad|ios/i.test(ua) ? 'iOS' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Other'
  const browser = /edg\//i.test(ua) ? 'Edge' : /opr\/|opera/i.test(ua) ? 'Opera' : /samsungbrowser/i.test(ua) ? 'Samsung Internet' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Other'
  return { device, os, browser }
}

function readCookie(header = '', name) {
  for (const part of String(header).split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return ''
}

const referrerHost = value => { try { return new URL(value).host } catch { return '' } }

/**
 * Records one visit to a campaign link. Never throws: tracking must not stop the redirect.
 * The visitor is a first-party cookie id; the IP is kept only as a salted hash.
 */
export async function recordVisit(req, res, { key, kind = 'campaign', config = {} }) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`)
    if (url.searchParams.get('track') === '0') return
    const ua = clean(req.headers['user-agent'], 300)
    let visitorId = readCookie(req.headers.cookie, COOKIE)
    const returning = Boolean(visitorId)
    if (!/^[0-9a-f-]{36}$/.test(visitorId)) visitorId = randomUUID()
    // Both cookies in one header value would be invalid; the adapter keeps the last Set-Cookie, so append instead.
    res.setHeader('Set-Cookie', `${COOKIE}=${visitorId}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`)
    res.appendCookie?.(`rc_cmp=${encodeURIComponent(key)}; Path=/; Max-Age=1800; SameSite=Lax; HttpOnly`)
    const ip = clean(String(req.headers['x-forwarded-for'] || '').split(',')[0], 64)
    const referrer = clean(req.headers.referer || req.headers.referrer, 300)
    // The link's own UTM values apply, and a UTM in the scanned URL (for example from an ad) takes priority.
    const param = name => clean(url.searchParams.get(name), 80) || clean(config[name], 80)
    const doc = {
      key, kind, ts: new Date(),
      utm_source: param('utm_source'), utm_medium: param('utm_medium'), utm_campaign: param('utm_campaign'),
      visitorId, returning,
      ipHash: ip ? createHash('sha256').update(`${process.env.AUTH_SECRET || 'rc'}:${ip}`).digest('hex').slice(0, 24) : '',
      referrer, referrerHost: referrerHost(referrer),
      country: clean(req.headers['x-vercel-ip-country'], 4), region: clean(req.headers['x-vercel-ip-country-region'], 40), city: clean(decodeURIComponentSafe(req.headers['x-vercel-ip-city']), 60),
      userAgent: ua, ...parseUserAgent(ua), isBot: BOT.test(ua) || !ua
    }
    if (sqlConfigured()) {
      await sqlReady()
      await sql().execute({
        sql: 'insert into campaign_visits (key, kind, ts, utm_source, utm_medium, utm_campaign, visitor_id, is_returning, ip_hash, referrer, referrer_host, country, region, city, user_agent, device, os, browser, is_bot) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        args: [doc.key, doc.kind, doc.ts.getTime(), doc.utm_source, doc.utm_medium, doc.utm_campaign, doc.visitorId, doc.returning ? 1 : 0, doc.ipHash, doc.referrer, doc.referrerHost, doc.country, doc.region, doc.city, doc.userAgent, doc.device, doc.os, doc.browser, doc.isBot ? 1 : 0]
      })
      return
    }
    const collection = (await getDb()).collection(VISITS())
    indexed ??= collection.createIndex({ key: 1, ts: -1 }).catch(() => {})
    await indexed
    await collection.insertOne(doc)
  } catch (error) {
    console.error('Unable to record campaign visit', error)
  }
}

const decodeURIComponentSafe = value => { try { return decodeURIComponent(String(value || '')) } catch { return '' } }


/** Full analytics for one campaign key, or all links when no key is given. */
const SQL_FIELDS = { key: 'key', bySource: 'utm_source', byMedium: 'utm_medium', byUtmCampaign: 'utm_campaign', byReferrer: 'referrer_host', byDevice: 'device', byOs: 'os', byBrowser: 'browser', byCountry: 'country', byCity: 'city' }

/** The same figures from the SQL database: one grouped query per breakdown. */
async function campaignAnalyticsSql({ key, days }) {
  await sqlReady()
  const db = sql()
  const since = Date.now() - days * 86400000
  const where = key ? 'ts >= ? and is_bot = 0 and key = ?' : 'ts >= ? and is_bot = 0'
  const args = key ? [since, key] : [since]
  const run = async (text, extra = []) => (await db.execute({ sql: text, args: [...extra] })).rows
  const grouped = async column => (await run(`select case when ${column} = '' then '(none)' else ${column} end as name, count(*) as visits, count(distinct visitor_id) as visitors from campaign_visits where ${where} group by name order by visits desc limit 15`, args)).map(r => ({ name: String(r.name), visits: Number(r.visits), visitors: Number(r.visitors) }))
  const ist = 'ts / 1000 + 19800'
  const [totals, daily, hourly, bots, recent, ...breakdowns] = await Promise.all([
    run(`select count(*) as visits, count(distinct visitor_id) as visitors, coalesce(sum(is_returning), 0) as repeat_visits from campaign_visits where ${where}`, args),
    run(`select strftime('%Y-%m-%d', ${ist}, 'unixepoch') as date, count(*) as visits, count(distinct visitor_id) as visitors from campaign_visits where ${where} group by date order by date`, args),
    run(`select cast(strftime('%H', ${ist}, 'unixepoch') as integer) as hour, count(*) as visits from campaign_visits where ${where} group by hour order by hour`, args),
    run(`select count(*) as n from campaign_visits where ts >= ? and is_bot = 1${key ? ' and key = ?' : ''}`, args),
    run(`select * from campaign_visits where ${where} order by ts desc limit 50`, args),
    ...Object.values(SQL_FIELDS).map(grouped)
  ])
  const [byLink, bySource, byMedium, byUtmCampaign, byReferrer, byDevice, byOs, byBrowser, byCountry, byCity] = breakdowns
  const t = totals[0] || {}
  return {
    days, key, botsExcluded: Number(bots[0]?.n || 0),
    totals: { visits: Number(t.visits || 0), visitors: Number(t.visitors || 0), returning: Number(t.repeat_visits || 0) },
    daily: daily.map(r => ({ date: String(r.date), visits: Number(r.visits), visitors: Number(r.visitors) })),
    hourly: hourly.map(r => ({ hour: Number(r.hour), visits: Number(r.visits) })),
    byLink, bySource, byMedium, byUtmCampaign, byReferrer, byDevice, byOs, byBrowser, byCountry, byCity,
    recent: recent.map(r => ({ key: r.key, kind: r.kind, ts: new Date(Number(r.ts)).toISOString(), utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign, visitorId: r.visitor_id, returning: Boolean(r.is_returning), referrer: r.referrer, referrerHost: r.referrer_host, country: r.country, region: r.region, city: r.city, device: r.device, os: r.os, browser: r.browser, isBot: false }))
  }
}

export async function campaignAnalytics({ key = '', days = 7 }) {
  if (sqlConfigured()) return campaignAnalyticsSql({ key, days })
  const db = await getDb()
  const visits = db.collection(VISITS())
  const since = new Date(Date.now() - days * 86400000)
  const match = { ts: { $gte: since }, isBot: { $ne: true }, ...(key ? { key } : {}) }
  const label = field => ({ $cond: [{ $in: [`$${field}`, ['', null]] }, '(none)', `$${field}`] })
  const grouped = field => [{ $group: { _id: label(field), visits: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } }, { $project: { visits: 1, visitors: { $size: '$visitors' } } }, { $sort: { visits: -1 } }, { $limit: 15 }]
  const [result] = await visits.aggregate([{ $match: match }, { $facet: {
    totals: [{ $group: { _id: null, visits: { $sum: 1 }, visitors: { $addToSet: '$visitorId' }, returning: { $sum: { $cond: ['$returning', 1, 0] } } } }, { $project: { _id: 0, visits: 1, returning: 1, visitors: { $size: '$visitors' } } }],
    daily: [{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts', timezone: 'Asia/Kolkata' } }, visits: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } }, { $project: { visits: 1, visitors: { $size: '$visitors' } } }, { $sort: { _id: 1 } }],
    hourly: [{ $group: { _id: { $hour: { date: '$ts', timezone: 'Asia/Kolkata' } }, visits: { $sum: 1 } } }, { $sort: { _id: 1 } }],
    byLink: grouped('key'), bySource: grouped('utm_source'), byMedium: grouped('utm_medium'), byUtmCampaign: grouped('utm_campaign'),
    byReferrer: grouped('referrerHost'), byDevice: grouped('device'), byOs: grouped('os'), byBrowser: grouped('browser'), byCountry: grouped('country'), byCity: grouped('city')
  } }]).toArray()
  const botCount = await visits.countDocuments({ ts: { $gte: since }, isBot: true, ...(key ? { key } : {}) })
  const recent = await visits.find(match, { projection: { _id: 0, userAgent: 0, ipHash: 0 } }).sort({ ts: -1 }).limit(50).toArray()
  const row = item => ({ name: item._id, visits: item.visits, visitors: item.visitors })
  return {
    days, key, botsExcluded: botCount,
    totals: result.totals[0] || { visits: 0, visitors: 0, returning: 0 },
    daily: result.daily.map(item => ({ date: item._id, visits: item.visits, visitors: item.visitors })),
    hourly: result.hourly.map(item => ({ hour: item._id, visits: item.visits })),
    byLink: result.byLink.map(row), bySource: result.bySource.map(row), byMedium: result.byMedium.map(row), byUtmCampaign: result.byUtmCampaign.map(row),
    byReferrer: result.byReferrer.map(row), byDevice: result.byDevice.map(row), byOs: result.byOs.map(row), byBrowser: result.byBrowser.map(row),
    byCountry: result.byCountry.map(row), byCity: result.byCity.map(row), recent
  }
}
