const roleRecordTypes = {
  admin: ['livestock', 'crops', 'sales', 'expenses', 'inventory'],
  manager: ['livestock', 'crops', 'sales', 'expenses', 'inventory'],
  livestock_officer: ['livestock', 'inventory'],
  crop_officer: ['crops'],
  accountant: ['livestock', 'crops', 'sales', 'expenses', 'inventory'],
  staff: ['livestock', 'crops', 'sales', 'expenses', 'inventory']
}

const canReadRecord = (role, type) =>
  Boolean(roleRecordTypes[role]?.includes(type))

const canWriteRecord = (role, type) =>
  role === 'admin' ||
  role === 'manager' ||
  (role === 'livestock_officer' && ['livestock', 'inventory'].includes(type)) ||
  (role === 'crop_officer' && type === 'crops') ||
  (role === 'accountant' && ['sales', 'expenses'].includes(type))

const hasFarmScope = (role) =>
  ['manager', 'livestock_officer', 'crop_officer', 'accountant', 'staff'].includes(role)

const getAccessibleFarmIds = async (req) => {
  if (req.userRole === 'admin') return null
  return req.assignedFarmIds ?? []
}

const requireRecordPermission = (action) => (req, res, next) => {
  const { type } = req.params
  const permitted =
    action === 'write'
      ? canWriteRecord(req.userRole, type)
      : canReadRecord(req.userRole, type)

  if (!permitted) {
    return res.status(403).json({ message: 'Your role cannot access this record type' })
  }

  next()
}

module.exports = {
  canReadRecord,
  canWriteRecord,
  getAccessibleFarmIds,
  hasFarmScope,
  requireRecordPermission
}
