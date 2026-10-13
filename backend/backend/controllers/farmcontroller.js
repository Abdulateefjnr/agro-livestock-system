const mongoose = require('mongoose')
const Crop = require('../models/crop')
const Expense = require('../models/expense')
const Farm = require('../models/farm')
const Inventory = require('../models/inventory')
const Livestock = require('../models/livestock')
const Sale = require('../models/sale')
const { canReadRecord, getAccessibleFarmIds } = require('../middleware/permissions')
const logActivity = require('../utils/audit')

const fields = [
  'name',
  'location',
  'sizeHectares',
  'farmType',
  'owner',
  'cropAreaHectares',
  'livestockAreaHectares',
  'otherAreaHectares',
  'status'
]

const getFields = (body = {}) =>
  Object.fromEntries(fields.filter((field) => body[field] !== undefined).map((field) => [
    field,
    typeof body[field] === 'string' ? body[field].trim() : body[field]
  ]))

const handleFarmError = (res, error, action) => {
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ message: error.message })
  }

  console.error(`Unable to ${action} farm:`, error)
  return res.status(500).json({ message: `Unable to ${action} farm right now` })
}

const getPerformanceByFarm = async (farmIds) => {
  if (!farmIds.length) return new Map()

  const match = { farmId: { $in: farmIds } }
  const [livestock, crops, sales, expenses, inventory] = await Promise.all([
    Livestock.aggregate([
      { $match: match },
      { $group: { _id: '$farmId', count: { $sum: 1 } } }
    ]),
    Crop.aggregate([
      { $match: { ...match, status: 'active' } },
      {
        $group: {
          _id: '$farmId',
          count: { $sum: 1 },
          plantedHectares: { $sum: '$plantedHectares' }
        }
      }
    ]),
    Sale.aggregate([
      { $match: match },
      { $group: { _id: '$farmId', total: { $sum: '$amount' } } }
    ]),
    Expense.aggregate([
      { $match: match },
      { $group: { _id: '$farmId', total: { $sum: '$amount' } } }
    ]),
    Inventory.aggregate([
      { $match: match },
      { $group: { _id: '$farmId', count: { $sum: 1 } } }
    ])
  ])

  const performance = new Map()
  const getStats = (id) => {
    const key = String(id)
    if (!performance.has(key)) {
      performance.set(key, {
        livestockCount: 0,
        activeCropFieldCount: 0,
        plantedHectares: 0,
        salesTotal: 0,
        expensesTotal: 0,
        inventoryItemCount: 0
      })
    }
    return performance.get(key)
  }

  livestock.forEach(({ _id, count }) => { getStats(_id).livestockCount = count })
  crops.forEach(({ _id, count, plantedHectares }) => {
    const stats = getStats(_id)
    stats.activeCropFieldCount = count
    stats.plantedHectares = plantedHectares
  })
  sales.forEach(({ _id, total }) => { getStats(_id).salesTotal = total })
  expenses.forEach(({ _id, total }) => { getStats(_id).expensesTotal = total })
  inventory.forEach(({ _id, count }) => { getStats(_id).inventoryItemCount = count })
  return performance
}

const listFarms = async (req, res) => {
  try {
    const accessibleFarmIds = await getAccessibleFarmIds(req)
    const farms = await Farm.find(
      accessibleFarmIds === null ? {} : { _id: { $in: accessibleFarmIds } }
    ).sort({ createdAt: -1 })
    const performance = await getPerformanceByFarm(farms.map((farm) => farm._id))
    return res.json(farms.map((farm) => ({
      ...farm.toObject(),
      performance: (() => {
        const stats = performance.get(String(farm._id)) ?? {
        livestockCount: 0,
        activeCropFieldCount: 0,
        plantedHectares: 0,
        salesTotal: 0,
        expensesTotal: 0,
        inventoryItemCount: 0
        }
        return {
          livestockCount: canReadRecord(req.userRole, 'livestock') ? stats.livestockCount : 0,
          activeCropFieldCount: canReadRecord(req.userRole, 'crops') ? stats.activeCropFieldCount : 0,
          plantedHectares: canReadRecord(req.userRole, 'crops') ? stats.plantedHectares : 0,
          salesTotal: canReadRecord(req.userRole, 'sales') ? stats.salesTotal : 0,
          expensesTotal: canReadRecord(req.userRole, 'expenses') ? stats.expensesTotal : 0,
          inventoryItemCount: canReadRecord(req.userRole, 'inventory') ? stats.inventoryItemCount : 0
        }
      })()
    })))
  } catch (error) {
    return handleFarmError(res, error, 'load')
  }
}

const createFarm = async (req, res) => {
  try {
    const farm = await Farm.create({ ...getFields(req.body), userId: req.userId })
    await logActivity({
      actorId: req.userId,
      action: 'farm_created',
      entityType: 'farm',
      entityId: farm._id,
      details: `Created farm ${farm.name}`
    })
    return res.status(201).json(farm)
  } catch (error) {
    return handleFarmError(res, error, 'create')
  }
}

const updateFarm = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid farm ID' })
  }

  try {
    const accessibleFarmIds = await getAccessibleFarmIds(req)
    const accessFilter = accessibleFarmIds === null
      ? {}
      : { _id: { $in: accessibleFarmIds } }
    const farm = await Farm.findOne({ _id: req.params.id, ...accessFilter })
    if (!farm) return res.status(404).json({ message: 'Farm not found' })

    Object.assign(farm, getFields(req.body))
    await farm.save()
    await logActivity({
      actorId: req.userId,
      action: 'farm_updated',
      entityType: 'farm',
      entityId: farm._id,
      details: `Updated farm ${farm.name}`
    })
    return res.json(farm)
  } catch (error) {
    return handleFarmError(res, error, 'update')
  }
}

const deleteFarm = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid farm ID' })
  }

  try {
    const farm = await Farm.findById(req.params.id)
    if (!farm) return res.status(404).json({ message: 'Farm not found' })

    const linkedCounts = await Promise.all([
      Livestock.countDocuments({ farmId: farm._id }),
      Crop.countDocuments({ farmId: farm._id }),
      Sale.countDocuments({ farmId: farm._id }),
      Expense.countDocuments({ farmId: farm._id }),
      Inventory.countDocuments({ farmId: farm._id })
    ])

    if (linkedCounts.some((count) => count > 0)) {
      return res.status(409).json({
        message: 'This farm has linked records. Reassign or delete them before deleting the farm.'
      })
    }

    await farm.deleteOne()
    await logActivity({
      actorId: req.userId,
      action: 'farm_deleted',
      entityType: 'farm',
      entityId: farm._id,
      details: `Deleted farm ${farm.name}`
    })
    return res.json({ message: 'Farm deleted successfully' })
  } catch (error) {
    return handleFarmError(res, error, 'delete')
  }
}

module.exports = { createFarm, deleteFarm, listFarms, updateFarm }
