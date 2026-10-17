const fs = require('node:fs')
const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '../.env') })
const Database = require('better-sqlite3')
const { getDatabase, closeDatabase, getDatabasePath } = require('../database')

async function main() {
  const destination = process.argv[2]
  if (!destination) throw new Error('Usage: npm run db:backup -- /absolute/path/to/backup.sqlite')
  const target = path.resolve(destination)
  const source = getDatabasePath()
  if (source === ':memory:' || !fs.existsSync(source)) throw new Error('The source SQLite database does not exist')
  if (target === path.resolve(source) || fs.existsSync(target)) throw new Error('Choose a new backup filename, separate from the live database')
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  const temporary = `${target}.partial-${process.pid}`
  try {
    await getDatabase().backup(temporary)
    fs.chmodSync(temporary, 0o600)
    const check = new Database(temporary, { readonly: true, fileMustExist: true })
    try {
      if (check.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Backup integrity check failed')
    } finally { check.close() }
    fs.renameSync(temporary, target)
    console.log(`SQLite backup saved to ${target}`)
  } finally {
    closeDatabase()
    fs.rmSync(temporary, { force: true })
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
