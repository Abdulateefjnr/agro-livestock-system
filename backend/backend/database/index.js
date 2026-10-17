const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')
const schemas = require('./schema')
let connection
const quote = (name) => `"${name}"`

function migrate(db) {
  const version = db.pragma('user_version', { simple: true })
  if (version > 2) throw new Error('Database schema is newer than this application')
  if (version === 0) db.transaction(() => {
    for (const [table, fields] of Object.entries(schemas)) {
      const columns = ['_id TEXT PRIMARY KEY NOT NULL', 'createdAt TEXT NOT NULL', 'updatedAt TEXT NOT NULL']
      for (const [name, spec] of Object.entries(fields)) {
        const field = quote(name)
        const type = spec.type === 'number' ? 'REAL' : spec.type === 'boolean' ? 'INTEGER' : 'TEXT'
        let sql = `${field} ${type}${spec.required ? ' NOT NULL' : ''}`
        if (spec.unique) sql += ' UNIQUE'
        if (spec.max) sql += ` CHECK(length(${field}) <= ${spec.max})`
        if (spec.min !== undefined) sql += ` CHECK(${field} >= ${spec.min})`
        if (spec.integer) sql += ` CHECK(${field} = CAST(${field} AS INTEGER))`
        if (spec.type === 'boolean') sql += ` CHECK(${field} IN (0, 1))`
        if (spec.enum) sql += ` CHECK(${field} IN (${spec.enum.map(value => `'${value.replaceAll("'", "''")}'`).join(',')}))`
        if (spec.type === 'reference') sql += ` REFERENCES ${quote(spec.table)}(_id) ON DELETE RESTRICT`
        columns.push(sql)
      }
      if (table === 'farms') columns.push('CHECK(cropAreaHectares + livestockAreaHectares + otherAreaHectares <= sizeHectares)')
      db.exec(`CREATE TABLE ${quote(table)} (${columns.join(', ')})`)
      for (const [name, spec] of Object.entries(fields)) {
        if (spec.type === 'reference' || spec.type === 'date') db.exec(`CREATE INDEX ${quote(`${table}_${name}`)} ON ${quote(table)} (${quote(name)})`)
      }
    }
    db.exec(`
      CREATE TABLE user_farms (
        userId TEXT NOT NULL REFERENCES users(_id) ON DELETE CASCADE,
        farmId TEXT NOT NULL REFERENCES farms(_id) ON DELETE CASCADE,
        PRIMARY KEY (userId, farmId)
      );
      CREATE INDEX user_farms_farmId ON user_farms(farmId);
      CREATE UNIQUE INDEX routine_client ON routines(userId, clientId) WHERE clientId IS NOT NULL;
      CREATE INDEX activities_createdAt ON activities(createdAt);
      PRAGMA user_version = 1;
    `)
  })()
  if (version < 2) db.transaction(() => {
    db.exec(`CREATE TABLE seed_history (name TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL, appliedAt TEXT NOT NULL); PRAGMA user_version = 2;`)
  })()
}

const getDatabasePath = () => process.env.DATABASE_PATH || path.join(__dirname, '../data/agro.sqlite')

function getDatabase() {
  if (connection?.open) return connection
  const filename = getDatabasePath()
  if (process.env.NODE_ENV === 'production' && (!process.env.DATABASE_PATH || filename === ':memory:')) {
    throw new Error('Set DATABASE_PATH to a SQLite file path in production')
  }
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true, mode: 0o700 })
  const db = new Database(filename, { timeout: 5000 })
  try {
    if (filename !== ':memory:') fs.chmodSync(filename, 0o600)
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = FULL')
    migrate(db)
    connection = db
    return connection
  } catch (error) { db.close(); throw error }
}
function closeDatabase() { if (connection?.open) connection.close(); connection = undefined }
const isValidId = (value) => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value)
module.exports = { getDatabase, closeDatabase, getDatabasePath, isValidId }
