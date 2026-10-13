const Activity = require('../models/activity')

const logActivity = async ({
  actorId,
  targetUserId = null,
  action,
  entityType,
  entityId = '',
  details = ''
}) => {
  try {
    await Activity.create({
      actorId,
      targetUserId,
      action,
      entityType,
      entityId: String(entityId),
      details
    })
  } catch (error) {
    console.error('Unable to record audit activity:', error)
  }
}

module.exports = logActivity
