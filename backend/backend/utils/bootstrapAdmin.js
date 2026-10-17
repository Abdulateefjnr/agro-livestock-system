const bcrypt = require('bcryptjs')
const User = require('../models/user')

module.exports = async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL.trim().toLowerCase()
  const existing = await User.findOne({ email })
  if (existing) {
    if (existing.role !== 'admin' || !existing.isActive || existing.status !== 'active') {
      throw new Error('Configured administrator already exists without active admin access. Resolve this account through a trusted database administrator before starting.')
    }
    return existing
  }
  const password = process.env.ADMIN_PASSWORD || ''
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Set ADMIN_PASSWORD to 12 or more characters (maximum 72 bytes) for initial administrator creation')
  }
  const user = await User.create({
    email, fullName: process.env.ADMIN_NAME || 'Administrator',
    password: await bcrypt.hash(password, 12), role: 'admin',
    status: 'active', isActive: true, farmAssignmentsConfigured: true
  })
  console.log('Initial administrator created')
  return user
}
