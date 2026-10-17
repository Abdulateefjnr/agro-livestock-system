const { isValidId } = require('../database')
const Crop = require('../models/crop')
const Expense = require('../models/expense')
const Farm = require('../models/farm')
const Inventory = require('../models/inventory')
const Livestock = require('../models/livestock')
const Sale = require('../models/sale')
const { getAccessibleFarmIds } = require('../middleware/permissions')
const logActivity = require('../utils/audit')

const recordTypes = {
  livestock: {
    model: Livestock,
    fields: ['name', 'species', 'tagId', 'farmId']
  },
  crops: {
    model: Crop,
    fields: ['name', 'status', 'plantedHectares', 'farmId']
  },
  sales: {
    model: Sale,
    fields: ['description', 'amount', 'date', 'farmId']
  },
  expenses: {
    model: Expense,
    fields: ['description', 'amount', 'date', 'farmId']
  },
  inventory: {
    model: Inventory,
    fields: ['name', 'category', 'quantity', 'unit', 'reorderLevel', 'farmId']
  }
}

const getRecordType = (type) =>
  Object.prototype.hasOwnProperty.call(recordTypes, type)
    ? recordTypes[type]
    : undefined

const getFields = (body = {}, fields) =>
  Object.fromEntries(fields
    .filter((field) => body[field] !== undefined)
    .map((field) => [
      field,
      field === 'farmId' && body[field] === '' ? null : body[field]
    ]))

const getRecordAccessFilter = async (req) => {
  const farmIds = await getAccessibleFarmIds(req)
  return farmIds === null ? {} : { farmId: { $in: farmIds } }
}

const validateFarmAssignment = async (fields, req) => {
  if (!Object.prototype.hasOwnProperty.call(fields, 'farmId')) return req.method !== 'POST' || req.userRole === 'admin'
  if (!fields.farmId) return req.userRole === 'admin'
  if (!isValidId(fields.farmId)) return false
  if (req.userRole === 'admin') {
    return Boolean(await Farm.exists({ _id: fields.farmId }))
  }
  const farmIds = await getAccessibleFarmIds(req)
  return farmIds.includes(String(fields.farmId))
}

const handleRecordError = (res, error, action) => {
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ message: error.message })
  }

  console.error(`Unable to ${action} record:`, error)
  return res.status(500).json({ message: `Unable to ${action} record right now` })
}

const listRecords = async (req, res) => {
  const config = getRecordType(req.params.type)

  if (!config) return res.status(404).json({ message: 'Record type not found' })

  try {
    const accessFilter = await getRecordAccessFilter(req)
    const records = await config.model
      .find(accessFilter)
      .sort({ date: -1, createdAt: -1 })
    return res.json(records)
  } catch (error) {
    return handleRecordError(res, error, 'load')
  }
}

const createRecord = async (req, res) => {
  const config = getRecordType(req.params.type)

  if (!config) return res.status(404).json({ message: 'Record type not found' })

  try {
    const fields = getFields(req.body ?? {}, config.fields)
    if (!(await validateFarmAssignment(fields, req))) {
      return res.status(400).json({ message: 'Select a farm assigned to your account' })
    }

    const record = await config.model.create({
      ...fields,
      userId: req.userId
    })
    await logActivity({
      actorId: req.userId,
      action: 'record_created',
      entityType: req.params.type,
      entityId: record._id,
      details: `Created ${req.params.type} record`
    })
    return res.status(201).json(record)
  } catch (error) {
    return handleRecordError(res, error, 'create')
  }
}

const updateRecord = async (req, res) => {
  const config = getRecordType(req.params.type)

  if (!config) return res.status(404).json({ message: 'Record type not found' })

  try {
    const fields = getFields(req.body ?? {}, config.fields)
    if (!(await validateFarmAssignment(fields, req))) {
      return res.status(400).json({ message: 'Select a farm assigned to your account' })
    }

    const accessFilter = await getRecordAccessFilter(req)
    const record = await config.model.findOne({
      _id: req.params.id,
      ...accessFilter
    })

    if (!record) return res.status(404).json({ message: 'Record not found' })

    Object.assign(record, fields)
    await record.save()
    await logActivity({
      actorId: req.userId,
      action: 'record_updated',
      entityType: req.params.type,
      entityId: record._id,
      details: `Updated ${req.params.type} record`
    })
    return res.json(record)
  } catch (error) {
    return handleRecordError(res, error, 'update')
  }
}

const deleteRecord = async (req, res) => {
  const config = getRecordType(req.params.type)

  if (!config) return res.status(404).json({ message: 'Record type not found' })

  try {
    const accessFilter = await getRecordAccessFilter(req)
    const record = await config.model.findOneAndDelete({
      _id: req.params.id,
      ...accessFilter
    })

    if (!record) return res.status(404).json({ message: 'Record not found' })

    await logActivity({
      actorId: req.userId,
      action: 'record_deleted',
      entityType: req.params.type,
      entityId: record._id,
      details: `Deleted ${req.params.type} record`
    })
    return res.json({ message: 'Record deleted successfully' })
  } catch (error) {
    return handleRecordError(res, error, 'delete')
  }
}

module.exports = { listRecords, createRecord, updateRecord, deleteRecord }
