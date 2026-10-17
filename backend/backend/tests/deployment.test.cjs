const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, rm, readdir, mkdir, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const request = require('supertest')
const { closeDatabase, getDatabase } = require('../database')
const jwt = require('jsonwebtoken')
const crypto = require('node:crypto')
let uploads, app, adminToken, User, Farm
const farmBody = (name) => ({ name, location: 'Keffi', sizeHectares: 10, farmType: 'Mixed', owner: 'Owner' })
const auth = (token) => ({ Authorization: `Bearer ${token}` })
const tokenFor = (user) => jwt.sign({ userId: String(user._id), sessionVersion: user.sessionVersion ?? 0 }, process.env.JWT_SECRET)

before(async () => {
  uploads = await mkdtemp(path.join(tmpdir(), 'agro-uploads-'))
  Object.assign(process.env, {
    NODE_ENV: 'test', SEED_DEMO_DATA: 'false', DATABASE_PATH: path.join(uploads, 'test.sqlite'),
    JWT_SECRET: 'test-secret-is-long-enough-for-validation-only',
    ADMIN_EMAIL: 'owner@example.test', ADMIN_PASSWORD: 'initial-admin-password',
    UPLOAD_DIR: path.join(uploads, 'pictures')
  })
  app = require('../server')
  User = require('../models/user')
  Farm = require('../models/farm')
  await request(app).get('/healthz').expect(200)
  const login = await request(app).post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200)
  adminToken = login.body.token
}, { timeout: 240000 })

after(async () => {
  closeDatabase()
  if (uploads) await rm(uploads, { recursive: true, force: true })
})

test('admin bootstrap is private, idempotent, and rejects an existing non-admin account', async () => {
  await request(app).post('/api/auth/signup').send({ fullName: 'Attacker', email: process.env.ADMIN_EMAIL, password: 'attacker-password' }).expect(403)
  const bootstrap = require('../utils/bootstrapAdmin')
  await bootstrap()
  assert.equal(await User.countDocuments({ role: 'admin' }), 1)
  const email = process.env.ADMIN_EMAIL
  try {
    process.env.ADMIN_EMAIL = 'existing@example.test'
    await User.create({ fullName: 'Existing', email: process.env.ADMIN_EMAIL, password: 'unused', role: 'staff' })
    await assert.rejects(bootstrap(), /without active admin access/)
  } finally { process.env.ADMIN_EMAIL = email }
})

test('signup validates passwords and never accepts a client-supplied admin role', async () => {
  await request(app).post('/api/auth/signup').send({ fullName: 'Worker', email: 'short@example.test', password: 'a' }).expect(400)
  const result = await request(app).post('/api/auth/signup').send({ fullName: 'Worker', email: 'worker@example.test', password: 'worker-password', role: 'admin' }).expect(201)
  assert.equal(result.body.user.role, 'staff')
  await request(app).get('/api/users').set(auth(result.body.token)).expect(403)
  await request(app).get('/api/farms').expect(401)
})

test('manager updates target exactly the requested assigned farm and cannot update another farm', async () => {
  const admin = await User.findOne({ role: 'admin' })
  const farms = await Farm.create(['First', 'Second', 'Unassigned'].map(name => ({ ...farmBody(name), userId: admin._id })))
  const manager = await User.create({ fullName: 'Manager', email: 'manager@example.test', password: 'unused', role: 'manager', farmAssignmentsConfigured: true, assignedFarmIds: farms.slice(0, 2).map(f => f._id) })
  const token = tokenFor(manager)
  await request(app).put(`/api/farms/${farms[1]._id}`).set(auth(token)).send({ name: 'Updated second' }).expect(200)
  assert.equal((await Farm.findById(farms[0]._id)).name, 'First')
  assert.equal((await Farm.findById(farms[1]._id)).name, 'Updated second')
  await request(app).put(`/api/farms/${farms[2]._id}`).set(auth(token)).send({ name: 'Forbidden' }).expect(404)
  await request(app).post('/api/records/livestock').set(auth(token)).send({ name: 'Cow', species: 'Cattle' }).expect(400)
  await request(app).post('/api/records/livestock').set(auth(token)).send({ name: 'Cow', species: 'Cattle', farmId: farms[2].id }).expect(400)
  const created = await request(app).post('/api/records/livestock').set(auth(token)).send({ name: 'Cow', species: 'Cattle', farmId: farms[1].id }).expect(201)
  await request(app).put(`/api/records/livestock/${created.body._id}`).set(auth(token)).send({ name: 'Updated cow' }).expect(200)
})

test('staff cannot modify shared routines; linked routines prevent farm deletion', async () => {
  const farm = await request(app).post('/api/farms').set(auth(adminToken)).send(farmBody('Routine farm')).expect(201)
  const staff = await User.create({ fullName: 'Read only', email: 'readonly@example.test', password: 'unused', role: 'staff', farmAssignmentsConfigured: true, assignedFarmIds: [farm.body._id] })
  const routine = { title: 'Feeding', type: 'Feeding', dueDate: '2026-10-20', repeat: 'Daily', farmId: farm.body._id }
  await request(app).post('/api/routines').set(auth(tokenFor(staff))).send(routine).expect(403)
  const saved = await request(app).post('/api/routines').set(auth(adminToken)).send(routine).expect(201)
  await request(app).patch(`/api/routines/${saved.body.id}`).set(auth(tokenFor(staff))).send({ completed: true }).expect(403)
  await request(app).delete(`/api/routines/${saved.body.id}`).set(auth(tokenFor(staff))).expect(403)
  await request(app).delete(`/api/farms/${farm.body._id}`).set(auth(adminToken)).expect(409)
})

test('profile images use the configured storage directory and remain retrievable', async () => {
  const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7XcAAAAASUVORK5CYII='
  const saved = await request(app).patch('/api/users/me/profile-picture').set(auth(adminToken)).send({ imageData }).expect(200)
  assert.equal((await readdir(process.env.UPLOAD_DIR)).length, 1)
  await request(app).get(`/api${saved.body.profilePicture}`).expect(200).expect('Content-Type', /image\/png/)
  await request(app).delete('/api/users/me/profile-picture').set(auth(adminToken)).expect(200)
  assert.equal((await readdir(process.env.UPLOAD_DIR)).length, 0)
})

test('password reset tokens are single use and revoke old sessions', async () => {
  const token = crypto.randomBytes(32).toString('hex')
  const user = await User.create({ fullName: 'Reset', email: 'reset@example.test', password: 'unused', role: 'staff', passwordResetToken: crypto.createHash('sha256').update(token).digest('hex'), passwordResetExpires: new Date(Date.now() + 60000) })
  const oldToken = tokenFor(user)
  const results = await Promise.all([1, 2].map(() => request(app).post('/api/auth/reset-password').send({ token, password: 'replacement-password' })))
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400])
  await request(app).get('/api/farms').set(auth(oldToken)).expect(401)
})

test('SPA routes, API 404s, JSON errors and security headers work', async () => {
  await request(app).get('/dashboard').expect(200).expect('Content-Type', /html/).expect('X-Content-Type-Options', 'nosniff')
  await request(app).get('/api/unknown').expect(404).expect('Content-Type', /json/)
  await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad').expect(400)
})

test('invitation and password recovery emails activate accounts and invalidate sessions', async (t) => {
  const mailer = require('../node_modules/nodemailer')
  const messages = []
  t.mock.method(mailer, 'createTransport', () => ({
    verify: async () => true,
    sendMail: async (message) => { messages.push(message); return { accepted: [message.to] } }
  }))
  Object.assign(process.env, {
    EMAIL_HOST: 'smtp.example.test', EMAIL_PORT: '465', EMAIL_USER: 'mailer',
    EMAIL_PASS: 'test-only', FRONTEND_URL: 'https://farm.example.test'
  })
  const invite = await request(app).post('/api/users').set(auth(adminToken)).send({ fullName: 'Invited', email: 'invited@example.test', role: 'accountant', assignedFarmIds: [] }).expect(201)
  assert.equal(invite.body.status, 'pending')
  const invitation = messages.at(-1).text.match(/https:\/\/[^ ]+/)[0]
  const url = new URL(invitation)
  assert.equal(url.origin, process.env.FRONTEND_URL)
  await request(app).post('/api/auth/reset-password').send({ token: url.searchParams.get('token'), password: 'invited-account-password' }).expect(200)
  const login = await request(app).post('/api/auth/login').send({ email: 'invited@example.test', password: 'invited-account-password' }).expect(200)
  await request(app).post('/api/auth/forgot-password').send({ email: 'invited@example.test' }).expect(200)
  const resetUrl = new URL(messages.at(-1).text.match(/https:\/\/[^ ]+/)[0].replace(/\.$/, ''))
  await request(app).post('/api/auth/reset-password').send({ token: resetUrl.searchParams.get('token'), password: 'new-invited-password' }).expect(200)
  await request(app).get('/api/farms').set(auth(login.body.token)).expect(401)
  const active = await User.findById(invite.body.id)
  assert.equal(active.status, 'active')
  const freshToken = tokenFor(active)
  await request(app).patch(`/api/users/${active.id}`).set(auth(adminToken)).send({ status: 'suspended' }).expect(200)
  await request(app).get('/api/farms').set(auth(freshToken)).expect(401)
})

test('SQLite persists records across connection restarts and applies foreign keys', async () => {
  const before = await User.countDocuments()
  closeDatabase()
  assert.equal(await User.countDocuments(), before)
  assert.equal(getDatabase().pragma('foreign_keys', { simple: true }), 1)
  assert.equal(getDatabase().pragma('journal_mode', { simple: true }), 'wal')
  assert.equal(getDatabase().pragma('user_version', { simple: true }), 2)
  await request(app).get('/healthz').expect(200)
  assert.throws(() => Farm.create({ ...farmBody('Orphan'), userId: 'f'.repeat(24) }), /linked record/)
})

test('dashboard SQL totals respect UTC months, farm scope, and alert thresholds', async () => {
  const admin = await User.findOne({ role: 'admin' })
  const [farm, other] = Farm.create(['Financial A', 'Financial B'].map(name => ({ ...farmBody(name), userId: admin.id })))
  const now = new Date()
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const Sale = require('../models/sale')
  const Expense = require('../models/expense')
  const Crop = require('../models/crop')
  const Inventory = require('../models/inventory')
  const owner = { userId: admin.id, farmId: farm.id }
  Sale.create([
    { ...owner, description: 'This month', amount: 125.5, date: current },
    { ...owner, description: 'Last month', amount: 80, date: previous },
    { ...owner, farmId: other.id, description: 'Hidden', amount: 999, date: current }
  ])
  Expense.create({ ...owner, description: 'Feed', amount: 25.5, date: current })
  Crop.create({ ...owner, name: 'Active field', status: 'active', plantedHectares: 3.5 })
  const inventory = Inventory.create({ ...owner, name: 'Empty feed', category: 'Feed', quantity: 0, unit: 'kg', reorderLevel: 0 })
  const staff = User.create({ fullName: 'Financial viewer', email: 'financial@example.test', password: 'unused', role: 'staff', farmAssignmentsConfigured: true, assignedFarmIds: [farm.id] })
  const token = tokenFor(staff)
  const summary = await request(app).get('/api/dashboard/summary').set(auth(token)).expect(200)
  assert.equal(summary.body.salesTotal, 125.5)
  assert.equal(summary.body.previousMonthSalesTotal, 80)
  assert.equal(summary.body.expensesTotal, 25.5)
  assert.equal(summary.body.activeCropFieldCount, 1)
  assert.equal(summary.body.plantedHectares, 3.5)
  const monitoring = await request(app).get('/api/dashboard/monitoring').set(auth(token)).expect(200)
  assert.equal(monitoring.body.monthly.length, 6)
  assert.equal(monitoring.body.monthly.at(-1).sales, 125.5)
  assert.equal(monitoring.body.monthly.at(-2).sales, 80)
  assert(monitoring.body.alerts.some(alert => alert.id === `inventory-${inventory.id}`))
  const farms = await request(app).get('/api/farms').set(auth(token)).expect(200)
  assert.equal(farms.body.length, 1)
  assert.equal(farms.body[0].performance.salesTotal, 205.5)
  assert.equal(farms.body[0].performance.expensesTotal, 25.5)
  const cropOfficer = User.create({ fullName: 'Crop officer', email: 'crop-viewer@example.test', password: 'unused', role: 'crop_officer', assignedFarmIds: [farm.id], farmAssignmentsConfigured: true })
  const restricted = await request(app).get('/api/dashboard/summary').set(auth(tokenFor(cropOfficer))).expect(200)
  assert.equal(restricted.body.salesTotal, 0)
  assert.equal(restricted.body.plantedHectares, 3.5)
})

test('record permissions and updates work for each operational role', async () => {
  const admin = await User.findOne({ role: 'admin' })
  const farm = Farm.create({ ...farmBody('Role matrix'), userId: admin.id })
  const samples = {
    livestock: { name: 'Tagged cow', species: 'Cattle', tagId: 'C001' },
    crops: { name: 'Maize', status: 'active', plantedHectares: 2 },
    inventory: { name: 'Feed', category: 'Feed', quantity: 5, unit: 'kg' },
    sales: { description: 'Sale', amount: 20 }, expenses: { description: 'Expense', amount: 10 }
  }
  const allowed = { manager: Object.keys(samples), livestock_officer: ['livestock', 'inventory'], crop_officer: ['crops'], accountant: ['sales', 'expenses'], staff: [] }
  for (const [role, types] of Object.entries(allowed)) {
    const user = User.create({ fullName: role, email: `${role}-matrix@example.test`, password: 'unused', role, assignedFarmIds: [farm.id], farmAssignmentsConfigured: true })
    const headers = auth(tokenFor(user))
    for (const [type, sample] of Object.entries(samples)) {
      const created = await request(app).post(`/api/records/${type}`).set(headers).send({ ...sample, farmId: farm.id }).expect(types.includes(type) ? 201 : 403)
      if (types.includes(type)) {
        await request(app).put(`/api/records/${type}/${created.body._id}`).set(headers).send(sample).expect(200)
        await request(app).delete(`/api/records/${type}/${created.body._id}`).set(headers).expect(200)
      }
    }
  }
  await request(app).post('/api/records/sales').set(auth(adminToken)).send({ description: 'Invalid amount', amount: -10, farmId: farm.id }).expect(400)
  const audit = await request(app).get('/api/users/activity').set(auth(adminToken)).expect(200)
  assert(audit.body.some(entry => entry.action === 'record_deleted' && entry.actor?.email.endsWith('-matrix@example.test')))
})

test('online backup includes committed data and refuses overwriting files', async () => {
  const { execFile } = require('node:child_process')
  const run = require('node:util').promisify(execFile)
  const destination = path.join(uploads, 'backup.sqlite')
  const script = path.resolve(__dirname, '../scripts/backup.js')
  await run(process.execPath, [script, destination], { env: process.env })
  const Database = require('../node_modules/better-sqlite3')
  const snapshot = new Database(destination, { readonly: true, fileMustExist: true })
  try {
    assert.equal(snapshot.prepare('SELECT COUNT(*) AS count FROM users').get().count, User.countDocuments())
    assert.equal(snapshot.pragma('integrity_check', { simple: true }), 'ok')
  } finally { snapshot.close() }
  await assert.rejects(run(process.execPath, [script, destination], { env: process.env }), /new backup filename/)
})

test('offline legacy import preserves IDs, hashes, assignments and rolls back invalid relationships', async () => {
  const { execFile } = require('node:child_process')
  const run = require('node:util').promisify(execFile)
  const directory = path.join(uploads, 'exports')
  await mkdir(directory)
  const userId = 'a'.repeat(24), farmId = 'b'.repeat(24)
  const timestamp = '2025-01-01T00:00:00.000Z'
  await writeFile(path.join(directory, 'users.json'), JSON.stringify([{ _id: { $oid: userId }, fullName: 'Legacy admin', email: 'legacy@example.test', password: 'original-hash', role: 'admin', assignedFarmIds: [{ $oid: farmId }], createdAt: { $date: timestamp }, updatedAt: { $date: timestamp } }]))
  await writeFile(path.join(directory, 'farms.json'), JSON.stringify([{ ...farmBody('Legacy'), _id: { $oid: farmId }, userId: { $oid: userId } }]))
  const databasePath = path.join(uploads, 'import.sqlite')
  const env = { ...process.env, DATABASE_PATH: databasePath }
  const script = path.resolve(__dirname, '../scripts/import-json.js')
  await run(process.execPath, [script, directory], { env })
  const Database = require('../node_modules/better-sqlite3')
  const imported = new Database(databasePath, { readonly: true })
  try {
    const row = imported.prepare('SELECT * FROM users WHERE _id = ?').get(userId)
    assert.equal(row.password, 'original-hash')
    assert.equal(row.createdAt, timestamp)
    assert.equal(row.updatedAt, timestamp)
    assert.equal(imported.prepare('SELECT farmId FROM user_farms WHERE userId = ?').get(userId).farmId, farmId)
  } finally { imported.close() }
  await assert.rejects(run(process.execPath, [script, directory], { env }), /empty SQLite database/)
  await writeFile(path.join(directory, 'farms.json'), JSON.stringify([{ ...farmBody('Broken'), _id: farmId, userId: 'c'.repeat(24) }]))
  const brokenPath = path.join(uploads, 'broken-import.sqlite')
  await assert.rejects(run(process.execPath, [script, directory], { env: { ...env, DATABASE_PATH: brokenPath } }), /Import failed/)
  const broken = new Database(brokenPath, { readonly: true })
  try { assert.equal(broken.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0) } finally { broken.close() }
})

test('production server retains existing SQLite data and recreates admin after temporary storage loss', async () => {
  const { spawn } = require('node:child_process')
  const net = require('node:net')
  const { once } = require('node:events')
  const socket = net.createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const env = { ...process.env, NODE_ENV: 'production', SEED_DEMO_DATA: 'true', DATABASE_PATH: path.join(uploads, 'production.sqlite'), PORT: String(port) }
  const start = () => {
    const child = spawn(process.execPath, [path.resolve(__dirname, '../server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    const ready = new Promise((resolve, reject) => {
      let output = ''
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Production server startup timed out')) }, 15000)
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('Server listening')) { clearTimeout(timeout); resolve() } })
      child.once('exit', code => { clearTimeout(timeout); if (!output.includes('Server listening')) reject(new Error(`Server startup failed (${code})`)) })
      child.once('error', error => { clearTimeout(timeout); reject(error) })
    })
    return { child, ready }
  }
  let running = start()
  try {
    await running.ready
    const origin = `http://127.0.0.1:${port}`
    assert.equal((await fetch(`${origin}/healthz`)).status, 200)
    const html = await fetch(`${origin}/dashboard`)
    assert.equal(html.status, 200)
    assert((await html.text()).includes('<div id="root">'))
    const signup = await fetch(`${origin}/api/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: 'Persistent worker', email: 'persistent@example.test', password: 'persistent-password' }) })
    assert.equal(signup.status, 201)
    const exited = once(running.child, 'exit')
    running.child.kill('SIGTERM')
    assert.equal((await exited)[0], 0)
    env.ADMIN_PASSWORD = ''
    running = start()
    await running.ready
    const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'persistent@example.test', password: 'persistent-password' }) })
    assert.equal(login.status, 200)
    assert.equal((await login.json()).user.fullName, 'Persistent worker')
    const stopped = once(running.child, 'exit')
    running.child.kill('SIGTERM')
    assert.equal((await stopped)[0], 0)
    for (const suffix of ['', '-wal', '-shm']) await rm(`${env.DATABASE_PATH}${suffix}`, { force: true })
    env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
    running = start()
    await running.ready
    const signIn = (email, password) => fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    const restoredAdmin = await signIn(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD)
    assert.equal(restoredAdmin.status, 200)
    const restoredToken = (await restoredAdmin.json()).token
    const restoredFarms = await fetch(`${origin}/api/farms`, { headers: auth(restoredToken) })
    assert.equal((await restoredFarms.json()).length, 3)
    assert.equal((await signIn('persistent@example.test', 'persistent-password')).status, 401)
  } finally {
    if (running.child.exitCode === null) {
      const exited = once(running.child, 'exit')
      running.child.kill('SIGTERM')
      await exited
    }
  }
})

test('authentication attempts are throttled', async () => {
  let result
  for (let i = 0; i < 31; i++) result = await request(app).post('/api/auth/login').send({})
  assert.equal(result.status, 429)
})
