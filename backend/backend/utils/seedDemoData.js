const { getDatabase } = require('../database')
const repository = require('../database/repository')
const demo = require('../seeds/demo')
const seedName = 'farm-demo-v1'

module.exports = function seedDemoData(admin, now = new Date()) {
  if (process.env.SEED_DEMO_DATA === 'false') return { status: 'disabled' }
  const db = getDatabase()
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM seed_history WHERE name = ?').get(seedName)) return { status: 'already_applied' }
    const tables = ['farms', 'livestock', 'crops', 'inventory', 'sales', 'expenses', 'routines']
    const existing = tables.some(table => repository(table).countDocuments() > 0)
    const status = existing ? 'skipped_existing' : 'seeded'
    if (!existing) {
      const data = demo(now)
      const farms = new Map()
      for (const { key, ...fields } of data.farms) {
        const farm = repository('farms').create({ ...fields, userId: admin._id })
        farms.set(key, farm._id)
      }
      const create = (table, row) => {
        const { farm, ...fields } = row
        return repository(table).create({ ...fields, userId: admin._id, farmId: farms.get(farm) })
      }
      for (const table of ['livestock', 'crops', 'inventory']) for (const row of data[table]) create(table, row)
      for (const period of data.transactions) {
        for (const table of ['sales', 'expenses']) for (const row of period[table]) create(table, { ...row, date: period.date })
      }
      for (const { dayOffset, ...row } of data.routines) {
        const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset))
        create('routines', { ...row, dueDate })
      }
      repository('activities').create({ actorId: admin._id, action: 'demo_seeded', entityType: 'system', details: 'Loaded fictional demonstration farms and records' })
    }
    db.prepare('INSERT INTO seed_history (name, status, appliedAt) VALUES (?, ?, ?)').run(seedName, status, now.toISOString())
    return { status }
  })()
}
