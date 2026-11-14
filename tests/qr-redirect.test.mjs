import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// Exercise the original controllers and services through the Next.js adapter,
// with an isolated MongoDB stand-in. Never touch the configured live database.
const collections = new Map()
let nextId = 1
function matches(record, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(part => matches(record, part))
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.entries(value).every(([op, expected]) => {
        if (op === '$ne') return record[key] !== expected
        if (op === '$gt') return record[key] > expected
        if (op === '$lte') return record[key] <= expected
        if (op === '$exists') return (record[key] !== undefined) === expected
        if (op === '$in') return expected.includes(record[key])
        throw new Error(`Unsupported test query: ${op}`)
      })
    }
    return record[key] === value
  })
}
function collection(name) {
  if (collections.has(name)) return collections.get(name)
  const rows = []
  const api = {
    rows,
    async createIndex() {},
    async findOne(query) { return structuredClone(rows.find(row => matches(row, query)) || null) },
    async findOneAndUpdate(query, update) {
      const row = rows.find(row => matches(row, query))
      if (!row) return null
      Object.assign(row, update.$set)
      return structuredClone(row)
    },
    async insertOne(row) { rows.push({ ...structuredClone(row), _id: nextId++ }) },
    async insertMany(records) { for (const row of records) await api.insertOne(row) },
    async estimatedDocumentCount() { return rows.length },
    async countDocuments() { return rows.length },
    async deleteOne(query) {
      const index = rows.findIndex(row => matches(row, query))
      if (index < 0) return { deletedCount: 0 }
      rows.splice(index, 1)
      return { deletedCount: 1 }
    },
    async deleteMany(query) {
      let deletedCount = 0
      for (let i = rows.length - 1; i >= 0; i--) {
        if (matches(rows[i], query)) { rows.splice(i, 1); deletedCount++ }
      }
      return { deletedCount }
    },
    async updateOne(query, update, options = {}) {
      let row = rows.find(row => matches(row, query))
      if (!row && options.upsert) {
        row = { ...query, ...update.$setOnInsert, _id: nextId++ }
        rows.push(row)
      }
      if (!row) return { matchedCount: 0 }
      Object.assign(row, update.$set)
      for (const [key, amount] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + amount
      for (const [key, value] of Object.entries(update.$push || {})) row[key] = [...(row[key] || []), ...value.$each].slice(value.$slice)
      return { matchedCount: 1 }
    },
    find(query = {}) {
      let found = rows.filter(row => matches(row, query))
      return {
        sort() { return this },
        skip(offset) { found = found.slice(offset); return this },
        limit(count) { found = found.slice(0, count); return this },
        async toArray() { return structuredClone(found) }
      }
    }
  }
  collections.set(name, api)
  return api
}
mock.module('../src/server/qr-redirect/mongodb.mjs', {
  namedExports: { getDb: async () => ({ collection }) }
})
mock.module('../src/server/qr-redirect/security.mjs', {
  namedExports: { requireQrAdmin: async request => {
    if (request.headers.get('authorization') === 'Bearer test-admin') return null
    return Response.json({ error: 'Portal administrator required' }, { status: request.headers.has('authorization') ? 403 : 401 })
  } }
})
for (const key of ['REWARD_COLLECTION', 'REWARD_CUSTOMER_COLLECTION', 'REWARD_OPTION_COLLECTION', 'USER_COLLECTION', 'PUBLIC_BASE_URL', 'PROD_PUBLIC_BASE_URL', 'DEV_PUBLIC_BASE_URL', 'APP_URL']) delete process.env[key]
const adapter = await import('../src/server/qr-redirect/adapter.mjs')
const req = (path, init) => new Request(`https://redchilly.test${path}`, init)
const adminReq = path => req(path, { headers: { authorization: 'Bearer test-admin' } })
const action = (name, query = '') => adapter.rewardAction(adminReq(`/reward/${name}${query}`), { params: Promise.resolve({ action: name }) })

test('printed campaign URL and clean campaign paths redirect with MongoDB message', async () => {
  await collection('qr_codes').insertOne({ key: 'order-qr-code-reward', phone: '+91 96701 00139', text: 'Test 🌶️ reward', active: true })
  for (const response of [
    await adapter.get(req('/get?key=order-qr-code-reward')),
    await adapter.campaign(req('/order-qr-code-reward'), { params: Promise.resolve({ campaign: ['order-qr-code-reward'] }) })
  ]) {
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const location = new URL(response.headers.get('location'))
    assert.equal(location.origin, 'https://api.whatsapp.com')
    assert.equal(location.searchParams.get('phone'), '919670100139')
    assert.equal(location.searchParams.get('text'), 'Test 🌶️ reward')
  }
  const missing = await adapter.get(req('/get?key=missing'))
  assert.equal(missing.status, 404)
  assert.match((await missing.json()).error, /No active WhatsApp redirect/)
})

test('separate login and QR token access are retired; only admin sessions authorize writes', async () => {
  assert.equal((await adapter.auth(req('/auth/login', { method: 'POST', body: '{}' }))).status, 410)
  const context = { params: Promise.resolve({ action: 'create' }) }
  for (const path of ['/reward/create', '/reward/create?token=test-reward-secret']) {
    assert.equal((await adapter.rewardAction(req(path), context)).status, 401)
    assert.equal((await adapter.reward(req('/api/reward?token=test-reward-secret'))).status, 401)
  }
  assert.equal((await adapter.rewardAction(req('/reward/create', { headers: { authorization: 'Bearer kitchen-user' } }), context)).status, 403)
  assert.equal((await adapter.rewardAction(req('/reward/create?action=verify'), context)).status, 401)
  assert.equal((await adapter.rewardAction(req('/reward/verify?action=create'), { params: Promise.resolve({ action: 'verify' }) })).status, 400)
  assert.equal((await adapter.update(req('/update?token=test-update-secret&key=order-qr-code-reward&text=Unauthorized'))).status, 401)
  const response = await adapter.update(adminReq('/update?key=order-qr-code-reward&text=Updated'))
  assert.equal(response.status, 200)
  const redirect = await adapter.get(req('/get?key=order-qr-code-reward'))
  assert.equal(new URL(redirect.headers.get('location')).searchParams.get('text'), 'Updated')
})

test('reward creation, status, single redemption, and customer visit tracking', async () => {
  assert.equal((await action('create', '?token=test-reward-secret&rewardMode=visits')).status, 400)
  const created = await action('create', '?token=test-reward-secret&orderId=TEST1&phone=%2B91%209999999999&customerName=Test&rewardMode=visits&visitTarget=1')
  assert.equal(created.status, 201)
  const { data } = await created.json()
  assert.match(data.qrImage, /^data:image\/png;base64,/)
  assert.equal(new URL(data.verifyUrl).origin, 'https://redchilly.test')
  assert.equal((await action('status', `?token=test-reward-secret&code=${data.code}`)).status, 200)
  const responses = await Promise.all([action('verify', `?code=${data.code}`), action('verify', `?code=${data.code}`)])
  assert.equal(responses.filter(response => response.status === 200).length, 1)
  assert.ok(responses.some(response => [404, 409].includes(response.status)))
  const customer = await action('customer', '?token=test-reward-secret&phone=919999999999')
  const history = (await customer.json()).data
  assert.equal(history.totalVisits, 1)
  assert.equal(history.rewardsUnlocked, 1)
  assert.equal(history.totalQrGenerated, 1)
  assert.equal((await action('verify', `?code=${data.code}`)).status, 404)
})

test('expired rewards, action routing, and protected cleanup', async () => {
  await collection('reward_qr_codes').insertOne({ code: 'expired', status: 'pending', expiresAt: new Date(0) })
  assert.equal((await action('verify', '?code=expired')).status, 410)
  assert.equal((await action('not-an-action')).status, 404)
  const response = await action('cleanup', '?token=test-reward-secret&force=true')
  assert.equal(response.status, 200)
  assert.equal((await collection('reward_qr_codes').countDocuments()), 0)
})

test('host and cleanup URLs lead to the dashboard, ordering page stays public', async () => {
  assert.equal((await adapter.host(req('/host'))).headers.get('location'), 'https://redchilly.test/admin/rewards?tab=generate')
  assert.equal((await adapter.cleanup(req('/cleanup'))).headers.get('location'), 'https://redchilly.test/admin/rewards?tab=cleanup')
  const response = await adapter.orderOnline(req('/order-online'))
  assert.equal(response.status, 200)
  assert.ok((await response.text()).includes('Order on Swiggy'))
})

const { manageQr } = await import('../src/server/qr-redirect/management.mjs')
const admin = { id: 'test-admin', roles: ['admin'], outlets: ['all'] }
const manage = body => manageQr(body, req('/api/admin/qr'), admin)

test('management requires global admin permissions and validates input', async () => {
  for (const user of [null, { roles: ['rooms'], outlets: ['all'] }, { roles: ['admin'], outlets: ['one-branch'] }]) {
    await assert.rejects(manageQr({ action: 'load' }, req('/api/admin/qr'), user), error => error.statusCode === 403)
  }
  await assert.rejects(manage({ action: 'save_campaign', data: { key: 'test', phone: 'bad', text: 'hello', active: true } }), error => error.statusCode === 400)
  await assert.rejects(manage({ action: 'save_settings', data: { expiryDays: -1 } }), error => error.statusCode === 400)
})

test('campaign editor creates, updates, deactivates and deletes campaigns', async () => {
  await manage({ action: 'save_campaign', data: { key: 'new-campaign', phone: '+91 99999 99999', text: 'New message', active: true } })
  assert.equal((await adapter.get(req('/get?key=new-campaign'))).status, 302)
  await assert.rejects(manage({ action: 'save_campaign', data: { key: 'new-campaign', phone: '919999999999', text: 'duplicate', active: true } }), error => error.statusCode === 409)
  await manage({ action: 'save_campaign', originalKey: 'new-campaign', data: { key: 'new-campaign', phone: '919999999999', text: 'Changed', active: false } })
  assert.equal((await adapter.get(req('/get?key=new-campaign'))).status, 404)
  await manage({ action: 'delete_campaign', key: 'new-campaign' })
  assert.equal(await collection('qr_codes').findOne({ key: 'new-campaign' }), null)
})

test('reward option and settings edits persist and affect newly generated QR codes', async () => {
  await manage({ action: 'save_option', data: { key: 'special', label: 'Special dessert', active: true } })
  await manage({ action: 'save_option', originalKey: 'special', data: { key: 'special', label: 'Updated dessert', active: true } })
  const loaded = await manage({ action: 'load' })
  await manage({ action: 'save_settings', data: { ...loaded.settings, expiryDays: 3, deleteOnVerify: false, publicBaseUrl: 'https://rewards.example.test' } })
  const generated = await manage({ action: 'generate', data: { rewardMode: 'discount', discountType: 'percentage', discountValue: 15, rewardOption: 'special', source: 'manual' } })
  assert.equal(new URL(generated.data.verifyUrl).origin, 'https://rewards.example.test')
  assert.equal(generated.data.rewardConfig.rewardOptionLabel, 'Updated dessert')
  assert.ok(Math.abs(new Date(generated.data.expiresAt).getTime() - Date.now() - 3 * 86400000) < 5000)
  const verified = await adapter.rewardAction(req(`/reward/verify?code=${generated.data.code}`), { params: Promise.resolve({ action: 'verify' }) })
  assert.equal(verified.status, 200)
  assert.equal((await verified.json()).data.deleted, false)
  assert.equal((await collection('reward_qr_codes').findOne({ code: generated.data.code })).status, 'verified')
  await manage({ action: 'delete_option', key: 'special' })
  assert.equal(await collection('reward_options').findOne({ key: 'special' }), null)
})

test('pending reward edits and cancellations preserve the code; completed rewards cannot be edited', async () => {
  const generated = await manage({ action: 'generate', data: { orderId: 'EDIT-1', rewardMode: 'discount', discountValue: 10 } })
  const data = { code: generated.data.code, orderId: 'EDIT-2', customerName: 'Updated', phone: '', source: 'manual', expiresAt: new Date(Date.now() + 86400000), rewardConfig: { mode: 'discount', discountType: 'percentage', discountValue: 25, visitTarget: 5, rewardOption: '' } }
  await manage({ action: 'save_reward', data })
  const saved = await collection('reward_qr_codes').findOne({ code: data.code })
  assert.equal(saved.orderId, 'EDIT-2')
  assert.equal(saved.rewardConfig.discountValue, 25)
  await manage({ action: 'cancel_reward', code: data.code })
  await assert.rejects(manage({ action: 'save_reward', data }), error => error.statusCode === 404)
  assert.equal((await action('verify', `?code=${data.code}`)).status, 404)
  await manage({ action: 'delete_reward', code: data.code })
})

test('customer corrections preserve history, and list endpoints support pagination', async () => {
  await manage({ action: 'save_customer', data: { phone: '919999999999', customerName: 'Corrected', visitCount: 2, totalVisits: 4, activeVisitTarget: 5 } })
  const customer = (await manage({ action: 'customer', phone: '919999999999' })).customer
  assert.equal(customer.customerName, 'Corrected')
  assert.equal(customer.totalVisits, 4)
  assert.equal(customer.rewardsUnlocked, 1)
  assert.equal(customer.user.name, 'Corrected')
  await assert.rejects(manage({ action: 'save_customer', data: { phone: '919999999999', customerName: 'Invalid', visitCount: 10, totalVisits: 2, activeVisitTarget: 5 } }), error => error.statusCode === 400)
  assert.ok(Array.isArray((await manage({ action: 'list_rewards' })).records))
  assert.ok(Array.isArray((await manage({ action: 'list_customers' })).customers))
})


test('deleting all reward options does not silently restore defaults; explicit restore works', async () => {
  const options = (await manage({ action: 'load' })).options
  for (const option of options) await manage({ action: 'delete_option', key: option.key })
  const response = await action('options')
  assert.deepEqual((await response.json()).data, [])
  assert.ok((await manage({ action: 'seed_options' })).options.length > 0)
})
