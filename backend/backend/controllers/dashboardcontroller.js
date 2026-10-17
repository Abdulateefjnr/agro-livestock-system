const Expense = require('../models/expense')
const Livestock = require('../models/livestock')
const Crop = require('../models/crop')
const Farm = require('../models/farm')
const Inventory = require('../models/inventory')
const Routine = require('../models/routine')
const Sale = require('../models/sale')
const { canReadRecord, getAccessibleFarmIds } = require('../middleware/permissions')

const getDashboardSummary = async (req, res) => {
  try {
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = now.getUTCMonth()
    const currentMonthStart = new Date(Date.UTC(year, month, 1))
    const nextMonthStart = new Date(Date.UTC(year, month + 1, 1))
    const previousMonthStart = new Date(Date.UTC(year, month - 1, 1))
    const accessibleFarmIds = await getAccessibleFarmIds(req)
    const recordScope = accessibleFarmIds === null
      ? {}
      : { farmId: { $in: accessibleFarmIds } }

    const [livestockCount, activeCropSummary, salesSummary, expensesSummary] =
      await Promise.all([
        Livestock.countDocuments(recordScope),
        Crop.summarize({ ...recordScope, status: 'active' }, { count: true, sums: { plantedHectares: 'plantedHectares' } }),
        Sale.periodTotals({ ...recordScope, date: { $gte: previousMonthStart, $lt: nextMonthStart } }, currentMonthStart),
        Expense.periodTotals({ ...recordScope, date: { $gte: previousMonthStart, $lt: nextMonthStart } }, currentMonthStart)
      ])

    res.json({
      month: `${year}-${String(month + 1).padStart(2, '0')}`,
      livestockCount: canReadRecord(req.userRole, 'livestock') ? livestockCount : 0,
      activeCropFieldCount: canReadRecord(req.userRole, 'crops') ? activeCropSummary[0]?.count ?? 0 : 0,
      plantedHectares: canReadRecord(req.userRole, 'crops') ? activeCropSummary[0]?.plantedHectares ?? 0 : 0,
      salesTotal: canReadRecord(req.userRole, 'sales') ? salesSummary[0]?.currentMonth ?? 0 : 0,
      previousMonthSalesTotal: canReadRecord(req.userRole, 'sales') ? salesSummary[0]?.previousMonth ?? 0 : 0,
      expensesTotal: canReadRecord(req.userRole, 'expenses') ? expensesSummary[0]?.currentMonth ?? 0 : 0,
      previousMonthExpensesTotal: canReadRecord(req.userRole, 'expenses') ? expensesSummary[0]?.previousMonth ?? 0 : 0
    })
  } catch (error) {
    console.error('Unable to calculate dashboard summary:', error)
    res.status(500).json({ message: 'Unable to load dashboard data right now' })
  }
}

const getFinancialMonitoring = async (req, res) => {
  try {
    const now = new Date()
    const periods = Array.from({ length: 6 }, (_, index) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1))
    )
    const periodStart = periods[0]
    const nextPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    const accessibleFarmIds = await getAccessibleFarmIds(req)
    const farmScope = accessibleFarmIds === null
      ? {}
      : { farmId: { $in: accessibleFarmIds } }
    const farmAccessScope = accessibleFarmIds === null
      ? {}
      : { _id: { $in: accessibleFarmIds } }
    const canViewSales = canReadRecord(req.userRole, 'sales')
    const canViewExpenses = canReadRecord(req.userRole, 'expenses')
    const canViewInventory = canReadRecord(req.userRole, 'inventory')
    const canViewCrops = canReadRecord(req.userRole, 'crops')
    const canViewLivestock = canReadRecord(req.userRole, 'livestock')
    const routineScope = accessibleFarmIds === null
      ? {}
      : {
          $or: [
            { farmId: { $in: accessibleFarmIds } },
            { farmId: null, userId: req.userId }
          ]
        }
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const upcomingThrough = new Date(today)
    upcomingThrough.setUTCDate(upcomingThrough.getUTCDate() + 7)

    const aggregateMonthly = (Model) => Model.monthlyTotals({
      ...farmScope,
      date: { $gte: periodStart, $lt: nextPeriodStart }
    })

    const [sales, expenses, lowStock, farmsNeedingAttention, inactiveCrops, untaggedLivestock, routines] = await Promise.all([
      canViewSales ? aggregateMonthly(Sale) : [],
      canViewExpenses ? aggregateMonthly(Expense) : [],
      canViewInventory
        ? Inventory.find({
            ...farmScope,
            $expr: { $lte: ['$quantity', '$reorderLevel'] }
          })
            .select('name quantity unit reorderLevel farmId')
            .populate('farmId', 'name')
            .sort({ quantity: 1 })
            .lean()
        : [],
      Farm.find({ ...farmAccessScope, status: { $in: ['inactive', 'maintenance'] } })
        .select('name location status')
        .sort({ name: 1 })
        .lean(),
      canViewCrops
        ? Crop.find({ ...farmScope, status: 'inactive' })
            .select('name status farmId')
            .populate('farmId', 'name')
            .sort({ name: 1 })
            .lean()
        : [],
      canViewLivestock
        ? Livestock.find({
            ...farmScope,
            $or: [{ tagId: { $exists: false } }, { tagId: null }, { tagId: '' }]
          })
            .select('name species farmId')
            .populate('farmId', 'name')
            .sort({ name: 1 })
            .lean()
        : [],
      Routine.find({
        ...routineScope,
        completed: false,
        dueDate: { $lt: new Date(upcomingThrough.getTime() + 86_400_000) }
      })
        .populate('farmId', 'name')
        .sort({ dueDate: 1 })
        .lean()
    ])

    const salesByMonth = new Map(sales.map(({ _id, total }) => [_id, total]))
    const expensesByMonth = new Map(expenses.map(({ _id, total }) => [_id, total]))
    const monthly = periods.map((period) => {
      const key = `${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, '0')}`
      return {
        month: key,
        sales: salesByMonth.get(key) ?? 0,
        expenses: expensesByMonth.get(key) ?? 0
      }
    })

    const routineAlerts = routines.map((routine) => {
      const dueDate = new Date(routine.dueDate)
      const dayDifference = Math.floor((dueDate.getTime() - today.getTime()) / 86_400_000)
      const status = dayDifference < 0
        ? 'Overdue'
        : dayDifference === 0
          ? 'Due today'
          : 'Due soon'
      const dueDescription = dayDifference < 0
        ? `Overdue by ${Math.abs(dayDifference)} day${Math.abs(dayDifference) === 1 ? '' : 's'}`
        : dayDifference === 0
          ? 'Due today'
          : `Due in ${dayDifference} day${dayDifference === 1 ? '' : 's'}`
      const farmName = routine.farmId?.name
      return {
        id: `routine-${routine._id}`,
        type: routine.type === 'Vaccination' ? 'health' : routine.type === 'Harvesting' || routine.type === 'Planting' ? 'crop' : 'routine',
        title: routine.title,
        source: `${routine.type} routine`,
        status,
        detail: `${dueDescription}${farmName ? ` · ${farmName}` : ''}`,
        href: '/settings#routine-settings'
      }
    })

    return res.json({
      monthly,
      canViewSales,
      canViewExpenses,
      alerts: [
        ...lowStock.map((item) => ({
          id: `inventory-${item._id}`,
          type: 'inventory',
          title: `${item.name} stock is at or below its reorder level`,
          source: 'Inventory',
          status: Number(item.quantity) === 0 ? 'Out of stock' : 'Low stock',
          detail: `${item.quantity} ${item.unit} remaining · reorder at ${item.reorderLevel}${item.farmId?.name ? ` · ${item.farmId.name}` : ''}`,
          href: '/records/inventory'
        })),
        ...farmsNeedingAttention.map((farm) => ({
          id: `farm-${farm._id}`,
          type: 'farm',
          title: farm.status === 'inactive' ? `${farm.name} is inactive` : `${farm.name} is under maintenance`,
          source: 'Farm status',
          status: farm.status === 'inactive' ? 'Inactive' : 'Maintenance',
          detail: farm.location,
          href: '/farms'
        })),
        ...inactiveCrops.map((crop) => ({
          id: `crop-${crop._id}`,
          type: 'crop',
          title: `${crop.name} is marked inactive`,
          source: 'Crop field',
          status: 'Inactive',
          detail: crop.farmId?.name ? `Review crop field · ${crop.farmId.name}` : 'Review crop field status',
          href: '/records/crops'
        })),
        ...untaggedLivestock.map((animal) => ({
          id: `livestock-${animal._id}`,
          type: 'livestock',
          title: `${animal.name} has no tag ID`,
          source: `${animal.species} record`,
          status: 'Needs ID',
          detail: animal.farmId?.name ? `Animal identification · ${animal.farmId.name}` : 'Animal identification',
          href: '/records/livestock'
        })),
        ...routineAlerts
      ]
    })
  } catch (error) {
    console.error('Unable to load financial monitoring data:', error)
    return res.status(500).json({ message: 'Unable to load financial monitoring data right now' })
  }
}

module.exports = { getDashboardSummary, getFinancialMonitoring }
