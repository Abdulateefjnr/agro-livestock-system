// Schema metadata is shared by SQL migrations and repository input validation.
const text = (max, extra = {}) => ({ type: 'text', max, ...extra })
const number = (extra = {}) => ({ type: 'number', min: 0, ...extra })
const boolean = (value) => ({ type: 'boolean', default: value, required: true })
const reference = (table, required = false) => ({ type: 'reference', table, required, default: null })
const date = (extra = {}) => ({ type: 'date', ...extra })
const owner = { userId: reference('users', true) }
const farmRecord = { ...owner, farmId: reference('farms') }
const transaction = { ...farmRecord, description: text(200, { required: true }), amount: number({ required: true }), date: date({ required: true, default: () => new Date() }) }

module.exports = {
  users: {
    fullName: text(120, { required: true }), email: text(254, { required: true, lowercase: true, unique: true }),
    phone: text(30, { default: '' }), role: text(30, { required: true, default: 'staff', enum: ['admin', 'manager', 'livestock_officer', 'crop_officer', 'accountant', 'staff'] }),
    farmAssignmentsConfigured: boolean(false), profilePicture: text(2048, { default: '' }),
    status: text(20, { required: true, default: 'active', enum: ['pending', 'active', 'inactive', 'suspended'] }),
    isActive: boolean(true), password: text(255, { required: true, trim: false }), lastLoginAt: date(),
    sessionVersion: number({ default: 0, required: true, integer: true }),
    passwordResetToken: text(64, { hidden: true }), passwordResetExpires: date({ hidden: true })
  },
  farms: {
    ...owner, name: text(120, { required: true }), location: text(160, { required: true }),
    sizeHectares: number({ required: true }), farmType: text(80, { required: true }), owner: text(120, { required: true }),
    cropAreaHectares: number({ default: 0 }), livestockAreaHectares: number({ default: 0 }), otherAreaHectares: number({ default: 0 }),
    status: text(20, { required: true, default: 'active', enum: ['active', 'inactive', 'maintenance'] })
  },
  livestock: { ...farmRecord, name: text(100, { required: true }), species: text(80, { required: true }), tagId: text(80) },
  crops: { ...farmRecord, name: text(100, { required: true }), status: text(20, { required: true, default: 'active', enum: ['active', 'inactive'] }), plantedHectares: number({ required: true }) },
  inventory: { ...farmRecord, name: text(120, { required: true }), category: text(80, { required: true }), quantity: number({ required: true }), unit: text(30, { required: true }), reorderLevel: number({ default: 0 }) },
  sales: transaction,
  expenses: transaction,
  routines: {
    ...farmRecord, clientId: text(80), title: text(120, { required: true }),
    type: text(30, { required: true, enum: ['Feeding', 'Vaccination', 'Irrigation', 'Fertilizing', 'Planting', 'Harvesting', 'Other'] }),
    dueDate: date({ required: true }), repeat: text(30, { required: true, default: 'Does not repeat', enum: ['Does not repeat', 'Daily', 'Weekly', 'Monthly'] }),
    completed: boolean(false)
  },
  activities: {
    actorId: reference('users', true), targetUserId: reference('users'), action: text(100, { required: true }),
    entityType: text(40, { required: true }), entityId: text(100, { default: '' }), details: text(240, { default: '' })
  }
}
