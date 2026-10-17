const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '../.env') })
const bootstrapAdmin = require('../utils/bootstrapAdmin')
const seedDemoData = require('../utils/seedDemoData')
const { closeDatabase } = require('../database')
async function main() {
  if (!process.env.ADMIN_EMAIL) throw new Error('Set ADMIN_EMAIL before seeding')
  const admin = await bootstrapAdmin()
  console.log(`Demo data: ${seedDemoData(admin).status}`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(closeDatabase)
