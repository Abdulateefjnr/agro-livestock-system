const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, rm } = require('node:fs/promises')
const path = require('node:path')
const { tmpdir } = require('node:os')
const { getDatabase, closeDatabase } = require('../database')
const repository = require('../database/repository')
const seed = require('../utils/seedDemoData')
let directory, admin
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'agro-seed-'))
  Object.assign(process.env, { NODE_ENV: 'test', DATABASE_PATH: path.join(directory, 'seed.sqlite'), SEED_DEMO_DATA: 'true' })
  admin = repository('users').create({ email: 'seed@example.test', fullName: 'Seed admin', password: 'test-only-hash', role: 'admin' })
})
afterEach(async () => { closeDatabase(); await rm(directory, { recursive: true, force: true }) })

test('demo seed creates related records, current-month finances and routine alerts once', () => {
  const now = new Date('2026-10-15T10:00:00Z')
  assert.equal(seed(admin, now).status, 'seeded')
  for (const [table, count] of Object.entries({ users: 1, farms: 3, livestock: 12, crops: 6, inventory: 8, sales: 18, expenses: 18, routines: 6 })) assert.equal(repository(table).countDocuments(), count, table)
  const sale = repository('sales').findOne({ date: new Date('2026-10-01T00:00:00Z') }).exec()
  assert(repository('farms').exists({ _id: sale.farmId }))
  assert.equal(sale.userId, admin.id)
  assert.equal(repository('routines').countDocuments({ dueDate: { $lt: new Date('2026-10-15T00:00:00Z') }, completed: false }), 1)
  const farm = repository('farms').findOne().exec()
  farm.name = 'My edited farm'
  farm.save()
  repository('livestock').deleteOne({})
  closeDatabase()
  assert.equal(seed(admin, now).status, 'already_applied')
  assert.equal(repository('farms').findById(farm.id).exec().name, 'My edited farm')
  assert.equal(repository('livestock').countDocuments(), 11)
})

test('existing farm data is preserved and is not mixed with demonstration records', () => {
  const farm = repository('farms').create({ name: 'Existing farm', location: 'Keffi', sizeHectares: 5, farmType: 'Mixed', owner: 'Owner', userId: admin.id })
  assert.equal(seed(admin).status, 'skipped_existing')
  assert.equal(repository('farms').countDocuments(), 1)
  assert.equal(repository('livestock').countDocuments(), 0)
  farm.deleteOne()
  assert.equal(seed(admin).status, 'already_applied')
  assert.equal(repository('farms').countDocuments(), 0)
})

test('seed can be disabled and failures roll back all inserted records', () => {
  process.env.SEED_DEMO_DATA = 'false'
  assert.equal(seed(admin).status, 'disabled')
  assert.equal(repository('farms').countDocuments(), 0)
  process.env.SEED_DEMO_DATA = 'true'
  assert.throws(() => seed({ _id: 'f'.repeat(24) }), /linked record/)
  assert.equal(repository('farms').countDocuments(), 0)
  assert.equal(getDatabase().prepare('SELECT COUNT(*) AS count FROM seed_history').get().count, 0)
  assert.equal(seed(admin).status, 'seeded')
})

test('upgrading an existing schema adds seed tracking without losing records', () => {
  getDatabase().exec('DROP TABLE seed_history; PRAGMA user_version = 1;')
  closeDatabase()
  assert.equal(repository('users').findById(admin.id).exec().email, 'seed@example.test')
  assert.equal(seed(admin).status, 'seeded')
})
