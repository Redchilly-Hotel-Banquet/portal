import { createHash } from 'node:crypto'
import { getDb } from './mongodb.mjs'
import { sql, sqlConfigured, sqlReady } from '../sql.mjs'
import { parseUserAgent, campaignAnalytics } from './tracking.mjs'
import { VISITS_COLLECTION } from './config.mjs'

/**
 * Whole-website tracking: every page view, plus clicks and other events, from every visitor, whether they came from a
 * campaign link / QR code, an ad, a search, another site or typed the address in. One row per page view or event; each
 * carries the visit's source so the analytics can be cut any way. QR scans are still logged by tracking.mjs and are
 * joined into the same report. No names, phones or IPs are stored: the visitor is a first-party cookie id and the IP is
 * kept only as a salted hash.
 */
const EVENTS = 'site_events'
const COOKIE = 'rc_vid'
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|axios|headless|monitor|uptime/i
const MAX_ROWS = 100000
let indexed

const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max)
const uuid = value => (/^[0-9a-f-]{36}$/i.test(String(value)) ? String(value) : '')
const num = (value, max) => { const n = Math.round(Number(value)); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0 }
const hostOf = value => { try { return new URL(value).host.replace(/^www\./, '') } catch { return '' } }
const decode = value => { try { return decodeURIComponent(String(value || '')) } catch { return '' } }
const readCookie = (header = '', name) => { for (const part of String(header).split(';')) { const [key, ...rest] = part.trim().split('='); if (key === name) return rest.join('=') } return '' }

const SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|baidu|yandex|brave)\./i
const SOCIAL = /(^|\.)(facebook|instagram|l\.instagram|t\.co|twitter|x\.com|linkedin|lnkd\.in|youtube|youtu\.be|whatsapp|wa\.me|pinterest|reddit|telegram|t\.me|snapchat|threads)\b/i
const FOOD = /(zomato|swiggy|magicpin|eazydiner|dineout)/i

/** Where a visit came from, in plain groups. */
export function channelOf({ ck, us, um, uc, cid, ref }, ownHost = '') {
  const medium = String(um || '').toLowerCase()
  if (ck) return 'QR / campaign link'
  if (cid || /^(cpc|ppc|paid|paidsearch|paid_social|display|ads?)$/.test(medium)) return 'Paid ads'
  if (/^e-?mail|newsletter/.test(medium)) return 'Email'
  if (us || um || uc) return 'Campaign (UTM)'
  const host = hostOf(ref)
  if (!host || host === ownHost) return 'Direct'
  if (FOOD.test(host)) return 'Food apps'
  if (SEARCH.test(host)) return 'Organic search'
  if (SOCIAL.test(host)) return 'Social'
  return 'Referral'
}

const COLUMNS = ['ts', 'type', 'pv_id', 'session_id', 'visitor_id', 'landing', 'is_new', 'path', 'title', 'channel', 'campaign_key', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'click_id', 'referrer', 'referrer_host', 'country', 'region', 'city', 'device', 'os', 'browser', 'language', 'screen', 'ip_hash', 'is_bot', 'event_name', 'event_value', 'duration_ms', 'scroll_pct']

async function ensureSql() {
  await sqlReady()
  globalThis.__redchillySiteEvents ??= sql().batch([
    `create table if not exists site_events (
      id integer primary key autoincrement, ts integer not null, type text not null, pv_id text not null default '',
      session_id text not null, visitor_id text not null, landing integer not null default 0, is_new integer not null default 0,
      path text not null default '', title text not null default '', channel text not null default '', campaign_key text not null default '',
      utm_source text not null default '', utm_medium text not null default '', utm_campaign text not null default '', utm_term text not null default '', utm_content text not null default '',
      click_id text not null default '', referrer text not null default '', referrer_host text not null default '',
      country text not null default '', region text not null default '', city text not null default '',
      device text not null default '', os text not null default '', browser text not null default '', language text not null default '', screen text not null default '',
      ip_hash text not null default '', is_bot integer not null default 0, event_name text not null default '', event_value text not null default '',
      duration_ms integer not null default 0, scroll_pct integer not null default 0
    )`,
    'create index if not exists site_events_ts on site_events (ts)',
    'create index if not exists site_events_pv on site_events (pv_id)'
  ], 'write').catch(error => { globalThis.__redchillySiteEvents = undefined; throw error })
  await globalThis.__redchillySiteEvents
}

/**
 * Records one hit sent by the website: a page view ("pv"), an event ("ev") or the end of a page view ("leave", which
 * adds the time spent and how far the visitor scrolled). Returns the headers to set and what the page keeps for the visit.
 * Never throws: tracking must never break the site.
 */
export async function recordSiteEvent(request) {
  const headers = {}
  try {
    const body = await request.json().catch(() => ({}))
    const type = { pv: 'pv', ev: 'ev', leave: 'leave' }[body.t]
    const sid = uuid(body.sid)
    if (!type || !sid) return { headers, ok: false }
    const header = name => request.headers.get(name) || ''
    let visitorId = readCookie(header('cookie'), COOKIE)
    const isNew = !uuid(visitorId)
    if (isNew) visitorId = crypto.randomUUID()
    headers['Set-Cookie'] = `${COOKIE}=${visitorId}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`
    const ua = clean(header('user-agent'), 300)
    const attr = body.attr && typeof body.attr === 'object' ? body.attr : {}
    const host = hostOf(`https://${header('host')}`)
    const landing = type === 'pv' && body.landing === true
    // A QR / campaign link scan sets this cookie just before sending the visitor on; it counts for the visit it started.
    const ck = clean(attr.ck, 120) || (landing ? clean(decode(readCookie(header('cookie'), 'rc_cmp')), 120) : '')
    const a = { ck, us: clean(attr.us, 80), um: clean(attr.um, 80), uc: clean(attr.uc, 80), ut: clean(attr.ut, 80), ucn: clean(attr.ucn, 80), cid: clean(attr.cid, 80), ref: clean(attr.ref, 300) }
    const ip = clean(header('x-forwarded-for').split(',')[0], 64)
    const doc = {
      ts: Date.now(), type, pv_id: uuid(body.pv), session_id: sid, visitor_id: visitorId, landing: landing ? 1 : 0, is_new: landing && isNew ? 1 : 0,
      path: clean(body.path, 200) || '/', title: clean(body.title, 150), channel: channelOf(a, host), campaign_key: a.ck,
      utm_source: a.us, utm_medium: a.um, utm_campaign: a.uc, utm_term: a.ut, utm_content: a.ucn, click_id: a.cid,
      referrer: hostOf(a.ref) === host ? '' : a.ref, referrer_host: hostOf(a.ref) === host ? '' : hostOf(a.ref),
      country: clean(header('x-vercel-ip-country'), 4), region: clean(header('x-vercel-ip-country-region'), 40), city: clean(decode(header('x-vercel-ip-city')), 60),
      ...parseUserAgent(ua), language: clean(body.lang, 20), screen: clean(body.scr, 20),
      ip_hash: ip ? createHash('sha256').update(`${process.env.AUTH_SECRET || 'rc'}:${ip}`).digest('hex').slice(0, 24) : '',
      is_bot: BOT.test(ua) || !ua ? 1 : 0, event_name: type === 'ev' ? clean(body.name, 60) : '', event_value: type === 'ev' ? clean(body.value, 200) : '',
      duration_ms: 0, scroll_pct: 0
    }
    if (type === 'leave') {
      const duration = num(body.dur, 3600000), scroll = Math.min(num(body.scroll, 100), 100)
      if (!doc.pv_id) return { headers, ok: false }
      if (sqlConfigured()) { await ensureSql(); await sql().execute({ sql: 'update site_events set duration_ms = ?, scroll_pct = ? where pv_id = ? and type = ?', args: [duration, scroll, doc.pv_id, 'pv'] }) }
      else await (await collection()).updateOne({ pv_id: doc.pv_id, type: 'pv' }, { $set: { duration_ms: duration, scroll_pct: scroll } })
      return { headers, ok: true }
    }
    if (sqlConfigured()) {
      await ensureSql()
      await sql().execute({ sql: `insert into site_events (${COLUMNS.join(',')}) values (${COLUMNS.map(() => '?').join(',')})`, args: COLUMNS.map(column => doc[column]) })
    } else await (await collection()).insertOne({ ...doc })
    return { headers, ok: true, ck: a.ck }
  } catch (error) {
    console.error('Unable to record site event', error)
    return { headers, ok: false }
  }
}

async function collection() {
  const events = (await getDb()).collection(EVENTS)
  indexed ??= Promise.all([events.createIndex({ ts: -1 }), events.createIndex({ pv_id: 1 })]).catch(() => {})
  await indexed
  return events
}

async function loadRows(since) {
  if (sqlConfigured()) {
    await ensureSql()
    const result = await sql().execute({ sql: `select ${COLUMNS.join(',')} from site_events where ts >= ? and is_bot = 0 order by ts desc limit ${MAX_ROWS}`, args: [since] })
    return { rows: result.rows.map(row => Object.fromEntries(COLUMNS.map(column => [column, row[column]]))), bots: Number((await sql().execute({ sql: 'select count(*) as n from site_events where ts >= ? and is_bot = 1 and type = ?', args: [since, 'pv'] })).rows[0]?.n || 0) }
  }
  const events = await collection()
  return { rows: await events.find({ ts: { $gte: since }, is_bot: 0 }, { projection: { _id: 0 } }).sort({ ts: -1 }).limit(MAX_ROWS).toArray(), bots: await events.countDocuments({ ts: { $gte: since }, is_bot: 1, type: 'pv' }) }
}

/**
 * Visits logged before website tracking started (QR / campaign link opens in campaign_visits) count as visits too, so
 * older data stays in the report. They stop at the first website event, after which the tracker covers the same visits.
 */
async function legacyRows(since) {
  let before = Infinity
  let raw = []
  if (sqlConfigured()) {
    await ensureSql()
    const first = (await sql().execute('select min(ts) as ts from site_events')).rows[0]?.ts
    if (first) before = Number(first)
    raw = (await sql().execute({ sql: 'select * from campaign_visits where ts >= ? and ts < ? and is_bot = 0 order by ts desc limit 20000', args: [since, Math.min(before, Date.now() + 1)] })).rows
      .map(r => ({ key: r.key, ts: Number(r.ts), utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign, visitor_id: r.visitor_id, returning: Boolean(r.is_returning), referrer: r.referrer, referrer_host: r.referrer_host, country: r.country, region: r.region, city: r.city, device: r.device, os: r.os, browser: r.browser }))
  } else {
    const db = await getDb()
    const first = await db.collection(EVENTS).find({}, { projection: { ts: 1 } }).sort({ ts: 1 }).limit(1).toArray()
    if (first[0]) before = Number(first[0].ts)
    raw = (await db.collection(VISITS_COLLECTION).find({ ts: { $gte: new Date(since), $lt: new Date(Math.min(before, Date.now() + 1)) }, isBot: { $ne: true } }).sort({ ts: -1 }).limit(20000).toArray())
      .map(r => ({ key: r.key, ts: new Date(r.ts).getTime(), utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign, visitor_id: r.visitorId, returning: Boolean(r.returning), referrer: r.referrer, referrer_host: r.referrerHost, country: r.country, region: r.region, city: r.city, device: r.device, os: r.os, browser: r.browser }))
  }
  return raw.map(r => ({
    ts: r.ts, type: 'pv', pv_id: '', session_id: `${r.visitor_id}:${new Date(r.ts + 19800000).toISOString().slice(0, 10)}`, visitor_id: r.visitor_id, landing: 1, is_new: r.returning ? 0 : 1,
    path: `QR / link: ${r.key}`, title: '', channel: 'QR / campaign link', campaign_key: r.key, utm_source: r.utm_source || '', utm_medium: r.utm_medium || '', utm_campaign: r.utm_campaign || '', utm_term: '', utm_content: '', click_id: '',
    referrer: r.referrer || '', referrer_host: r.referrer_host || '', country: r.country || '', region: r.region || '', city: r.city || '', device: r.device || '', os: r.os || '', browser: r.browser || '', language: '', screen: '',
    is_bot: 0, event_name: '', event_value: '', duration_ms: 0, scroll_pct: 0
  }))
}

const ist = ts => new Date(Number(ts) + 19800000)
const top = (rows, nameOf, limit = 15) => {
  const groups = new Map()
  for (const row of rows) {
    const name = nameOf(row) || '(none)'
    const group = groups.get(name) || { name, visits: 0, people: new Set() }
    group.visits += 1
    group.people.add(row.visitor_id)
    groups.set(name, group)
  }
  return [...groups.values()].map(g => ({ name: g.name, visits: g.visits, visitors: g.people.size })).sort((a, b) => b.visits - a.visits).slice(0, limit)
}

/**
 * The website report for the last `days` days. "Visits" are sessions (a visitor's run of page views, ended by 30 minutes
 * of quiet); where-from and who figures count each visit once, pages count every page view.
 */
export async function siteAnalytics({ days = 7, campaign = '' }) {
  const since = Date.now() - days * 86400000
  const { rows: loaded, bots } = await loadRows(since)
  const all = [...loaded, ...await legacyRows(since).catch(() => [])].sort((a, b) => Number(b.ts) - Number(a.ts))
  const inCampaign = row => !campaign || row.campaign_key === campaign || row.utm_campaign === campaign
  const rows = all.filter(inCampaign)
  const views = rows.filter(row => row.type === 'pv')
  const events = rows.filter(row => row.type === 'ev')
  const entries = views.filter(row => row.landing)
  const sessions = new Map()
  for (const row of views) {
    const session = sessions.get(row.session_id) || { pages: 0, ms: 0 }
    session.pages += 1; session.ms += Number(row.duration_ms) || 0
    sessions.set(row.session_id, session)
  }
  const sessionList = [...sessions.values()]
  const people = rows => new Set(rows.map(row => row.visitor_id)).size
  const timed = views.filter(row => Number(row.duration_ms) > 0)

  const dayOf = row => ist(row.ts).toISOString().slice(0, 10)
  const daily = new Map()
  for (const row of views) {
    const entry = daily.get(dayOf(row)) || { date: dayOf(row), pageviews: 0, sessions: new Set(), people: new Set() }
    entry.pageviews += 1; entry.sessions.add(row.session_id); entry.people.add(row.visitor_id)
    daily.set(entry.date, entry)
  }
  const hourly = new Map()
  for (const row of entries) { const hour = ist(row.ts).getUTCHours(); hourly.set(hour, (hourly.get(hour) || 0) + 1) }

  const pages = new Map()
  for (const row of views) {
    const page = pages.get(row.path) || { name: row.path, visits: 0, people: new Set(), ms: 0, timed: 0, scroll: 0 }
    page.visits += 1; page.people.add(row.visitor_id)
    if (Number(row.duration_ms) > 0) { page.ms += Number(row.duration_ms); page.scroll += Number(row.scroll_pct) || 0; page.timed += 1 }
    pages.set(row.path, page)
  }

  // Campaigns: a QR / link scan is one open of the link; visits are what the visitors then did on the website.
  const qr = await campaignAnalytics({ key: '', days }).catch(() => null)
  const campaigns = new Map()
  const campaignRow = name => { if (!campaigns.has(name)) campaigns.set(name, { name, scans: 0, visits: 0, visitors: new Set(), pageviews: 0, events: 0 }); return campaigns.get(name) }
  for (const row of all) {
    const name = row.campaign_key || row.utm_campaign
    if (!name) continue
    const entry = campaignRow(name)
    entry.visitors.add(row.visitor_id)
    if (row.type === 'pv') { entry.pageviews += 1; if (row.landing) entry.visits += 1 } else if (row.type === 'ev') entry.events += 1
  }
  for (const link of qr?.byLink || []) if (link.name !== '(none)') campaignRow(link.name).scans = link.visits

  return {
    days, campaign, botsExcluded: bots, qrOpens: { opens: qr?.totals.visits ?? 0, people: qr?.totals.visitors ?? 0 }, truncated: all.length >= MAX_ROWS,
    now: people(all.filter(row => Date.now() - Number(row.ts) < 5 * 60000)),
    totals: {
      pageviews: views.length, visits: sessions.size, visitors: people(views), newVisitors: entries.filter(row => row.is_new).length,
      returning: entries.filter(row => !row.is_new).length,
      bounceRate: sessionList.length ? Math.round(sessionList.filter(s => s.pages === 1).length / sessionList.length * 100) : 0,
      pagesPerVisit: sessionList.length ? Math.round(views.length / sessionList.length * 10) / 10 : 0,
      avgSeconds: timed.length ? Math.round(timed.reduce((n, row) => n + Number(row.duration_ms), 0) / timed.length / 1000) : 0,
      events: events.length
    },
    daily: [...daily.values()].map(d => ({ date: d.date, visits: d.pageviews, visitors: d.people.size, sessions: d.sessions.size })).sort((a, b) => a.date.localeCompare(b.date)),
    hourly: [...hourly].map(([hour, visits]) => ({ hour, visits })),
    byChannel: top(entries, r => r.channel), bySource: top(entries, r => r.utm_source), byMedium: top(entries, r => r.utm_medium), byUtmCampaign: top(entries, r => r.utm_campaign),
    byReferrer: top(entries, r => r.referrer_host || 'Direct'), byQr: top(entries.filter(r => r.campaign_key), r => r.campaign_key),
    byDevice: top(entries, r => r.device), byOs: top(entries, r => r.os), byBrowser: top(entries, r => r.browser), byLanguage: top(entries, r => r.language),
    byCountry: top(entries, r => r.country), byCity: top(entries, r => r.city), byScreen: top(entries, r => r.screen),
    landingPages: top(entries, r => r.path),
    pages: [...pages.values()].map(p => ({ name: p.name, visits: p.visits, visitors: p.people.size, avgSeconds: p.timed ? Math.round(p.ms / p.timed / 1000) : 0, scroll: p.timed ? Math.round(p.scroll / p.timed) : 0 })).sort((a, b) => b.visits - a.visits).slice(0, 15),
    events: top(events, r => r.event_name),
    campaigns: [...campaigns.values()].map(c => ({ name: c.name, scans: c.scans, visits: c.visits, visitors: c.visitors.size, pageviews: c.pageviews, events: c.events })).sort((a, b) => b.visits + b.scans - (a.visits + a.scans)).slice(0, 30),
    recent: views.slice(0, 50).map(r => ({ ts: new Date(Number(r.ts)).toISOString(), path: r.path, channel: r.channel, source: [r.utm_source, r.utm_medium].filter(Boolean).join(' / '), campaign: r.campaign_key || r.utm_campaign, referrer: r.referrer_host, device: r.device, os: r.os, browser: r.browser, city: r.city, country: r.country, isNew: Boolean(r.is_new), landing: Boolean(r.landing), seconds: Math.round((Number(r.duration_ms) || 0) / 1000) }))
  }
}
