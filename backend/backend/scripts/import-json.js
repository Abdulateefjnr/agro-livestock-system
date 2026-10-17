// Optional offline migration from JSON exports. Never connects to a MongoDB server.
const fs = require('node:fs')
const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '../.env') })
const repository = require('../database/repository')
const { getDatabase, closeDatabase } = require('../database')
const tables = ['users', 'farms', 'livestock', 'crops', 'inventory', 'sales', 'expenses', 'routines', 'activities']
const names = { inventory: 'inventories' }
function decode(value) {
  if (Array.isArray(value)) return value.map(decode)
  if (value && typeof value === 'object') {
    if ('$oid' in value) return value.$oid
    if ('$date' in value) return new Date(typeof value.$date === 'object' ? Number(value.$date.$numberLong) : value.$date)
    if ('$numberDecimal' in value) return Number(value.$numberDecimal)
    if ('$numberLong' in value) return Number(value.$numberLong)
    if ('$numberInt' in value) return Number(value.$numberInt)
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]))
  }
  return value
}
function main() {
  const directory = process.argv[2]
  if (!directory || !fs.statSync(directory).isDirectory()) throw new Error('Usage: npm run db:import -- /path/to/json-exports')
  const input = Object.fromEntries(tables.map(table => {
    const filename = [table, names[table]].filter(Boolean).map(name => path.join(directory, `${name}.json`)).find(file => fs.existsSync(file))
    if (!filename) return [table, []]
    const text = fs.readFileSync(filename, 'utf8').trim()
    const rows = text.startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
    return [table, decode(rows)]
  }))
  if (!input.users.length) throw new Error('users.json must contain at least one user')
  const db = getDatabase()
  db.transaction(() => {
    for (const table of tables) {
      if (repository(table).countDocuments()) throw new Error('Import requires an empty SQLite database; no data was changed')
    }
    const assignments = []
    for (const table of tables) {
      for (const original of input[table]) {
        const row = { ...original }
        if (table === 'users') { assignments.push([row._id, row.assignedFarmIds || [], row.updatedAt]); row.assignedFarmIds = [] }
        repository(table).create(row)
      }
    }
    for (const [id, farms, updatedAt] of assignments) {
      const user = repository('users').findById(id).exec()
      user.assignedFarmIds = farms
      user.save()
      if (updatedAt) db.prepare('UPDATE users SET updatedAt = ? WHERE _id = ?').run(new Date(updatedAt).toISOString(), id)
    }
  })()
  console.log(`Imported ${tables.map(table => `${input[table].length} ${table}`).join(', ')}`)
}
try { main() } catch (error) { console.error(`Import failed: ${error.message}`); process.exitCode = 1 } finally { closeDatabase() }
