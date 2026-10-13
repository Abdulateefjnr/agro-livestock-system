const mongoose = require('mongoose')
const Farm = require('../models/farm')
const Routine = require('../models/routine')
const { getAccessibleFarmIds } = require('../middleware/permissions')
const logActivity = require('../utils/audit')

const activityTypes = ['Feeding', 'Vaccination', 'Irrigation', 'Fertilizing', 'Planting', 'Harvesting', 'Other']
const repeatOptions = ['Does not repeat', 'Daily', 'Weekly', 'Monthly']

const getRoutineScope = async (req) => {
  const farmIds = await getAccessibleFarmIds(req)
  return farmIds === null
    ? {}
    : {
        $or: [
          { farmId: { $in: farmIds } },
          { farmId: null, userId: req.userId }
        ]
      }
}

const serializeRoutine = (routine) => ({
  id: String(routine._id),
  title: routine.title,
  type: routine.type,
  dueDate: new Date(routine.dueDate).toISOString().slice(0, 10),
  repeat: routine.repeat,
  completed: routine.completed,
  clientId: routine.clientId ?? '',
  farmId: routine.farmId ? String(routine.farmId._id ?? routine.farmId) : '',
  farmName: routine.farmId && typeof routine.farmId === 'object'
    ? routine.farmId.name ?? ''
    : ''
})

const validateRoutineInput = async (body, req, current = {}) => {
  const title = body.title === undefined ? current.title : body.title
  const type = body.type === undefined ? current.type : body.type
  const dueDate = body.dueDate === undefined
    ? current.dueDate instanceof Date
      ? current.dueDate.toISOString().slice(0, 10)
      : current.dueDate
    : body.dueDate
  const repeat = body.repeat === undefined ? current.repeat : body.repeat
  const farmId = body.farmId === undefined ? String(current.farmId ?? '') : body.farmId
  const clientId = body.clientId === undefined ? current.clientId : body.clientId

  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) {
    return { error: 'Enter a task title up to 120 characters' }
  }
  if (!activityTypes.includes(type)) return { error: 'Select a valid farm activity' }
  const parsedDueDate = typeof dueDate === 'string'
    ? new Date(`${dueDate}T00:00:00.000Z`)
    : null
  if (
    typeof dueDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
    Number.isNaN(parsedDueDate?.getTime()) ||
    parsedDueDate.toISOString().slice(0, 10) !== dueDate
  ) {
    return { error: 'Select a valid due date' }
  }
  if (!repeatOptions.includes(repeat)) return { error: 'Select a valid repeat schedule' }
  if (typeof farmId !== 'string') return { error: 'Select a valid farm' }
  if (clientId !== undefined && (typeof clientId !== 'string' || !/^[\w-]{1,80}$/.test(clientId))) {
    return { error: 'Invalid routine migration identifier' }
  }

  let normalizedFarmId = null
  if (farmId) {
    if (!mongoose.isValidObjectId(farmId)) return { error: 'Select a valid farm' }
    const farm = await Farm.exists({ _id: farmId })
    if (!farm) return { error: 'Selected farm was not found' }
    const accessibleFarmIds = await getAccessibleFarmIds(req)
    if (accessibleFarmIds !== null && !accessibleFarmIds.includes(farmId)) {
      return { error: 'You can only assign routines to farms assigned to your account' }
    }
    normalizedFarmId = farmId
  }

  const completed = body.completed === undefined ? current.completed ?? false : body.completed
  if (typeof completed !== 'boolean') return { error: 'Routine completion must be true or false' }

  return {
    value: {
      title: title.trim(),
      type,
      dueDate: new Date(`${dueDate}T00:00:00.000Z`),
      repeat,
      farmId: normalizedFarmId,
      completed,
      clientId
    }
  }
}

const listRoutines = async (req, res) => {
  try {
    const routines = await Routine.find(await getRoutineScope(req))
      .populate('farmId', 'name')
      .sort({ dueDate: 1, createdAt: -1 })
      .lean()
    return res.json(routines.map(serializeRoutine))
  } catch (error) {
    console.error('Unable to load farm routines:', error)
    return res.status(500).json({ message: 'Unable to load farm routines right now' })
  }
}

const createRoutine = async (req, res) => {
  try {
    const validated = await validateRoutineInput(req.body ?? {}, req)
    if (validated.error) return res.status(400).json({ message: validated.error })

    if (validated.value.clientId) {
      const existing = await Routine.findOne({
        userId: req.userId,
        clientId: validated.value.clientId
      }).populate('farmId', 'name').lean()
      if (existing) return res.json(serializeRoutine(existing))
    }

    const routine = await Routine.create({ ...validated.value, userId: req.userId })
    await logActivity({
      actorId: req.userId,
      action: 'routine_created',
      entityType: 'routine',
      entityId: routine._id,
      details: `Created ${routine.type} routine: ${routine.title}`
    })
    const saved = await Routine.findById(routine._id).populate('farmId', 'name').lean()
    return res.status(201).json(serializeRoutine(saved))
  } catch (error) {
    if (error.code === 11000 && typeof req.body?.clientId === 'string') {
      const existing = await Routine.findOne({
        userId: req.userId,
        clientId: req.body.clientId
      }).populate('farmId', 'name').lean()
      if (existing) return res.json(serializeRoutine(existing))
    }
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({ message: error.message })
    }
    console.error('Unable to create farm routine:', error)
    return res.status(500).json({ message: 'Unable to create this farm routine right now' })
  }
}

const updateRoutine = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid routine ID' })
  }
  try {
    const routine = await Routine.findOne({
      _id: req.params.id,
      ...(await getRoutineScope(req))
    })
    if (!routine) return res.status(404).json({ message: 'Farm routine not found' })

    const validated = await validateRoutineInput(req.body ?? {}, req, routine)
    if (validated.error) return res.status(400).json({ message: validated.error })
    Object.assign(routine, validated.value)
    await routine.save()
    await logActivity({
      actorId: req.userId,
      action: 'routine_updated',
      entityType: 'routine',
      entityId: routine._id,
      details: `Updated ${routine.type} routine: ${routine.title}`
    })
    const saved = await Routine.findById(routine._id).populate('farmId', 'name').lean()
    return res.json(serializeRoutine(saved))
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({ message: error.message })
    }
    console.error('Unable to update farm routine:', error)
    return res.status(500).json({ message: 'Unable to update this farm routine right now' })
  }
}

const deleteRoutine = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid routine ID' })
  }
  try {
    const routine = await Routine.findOneAndDelete({
      _id: req.params.id,
      ...(await getRoutineScope(req))
    })
    if (!routine) return res.status(404).json({ message: 'Farm routine not found' })
    await logActivity({
      actorId: req.userId,
      action: 'routine_deleted',
      entityType: 'routine',
      entityId: routine._id,
      details: `Deleted ${routine.type} routine: ${routine.title}`
    })
    return res.json({ message: 'Farm routine deleted' })
  } catch (error) {
    console.error('Unable to delete farm routine:', error)
    return res.status(500).json({ message: 'Unable to delete this farm routine right now' })
  }
}

module.exports = { createRoutine, deleteRoutine, listRoutines, updateRoutine }
