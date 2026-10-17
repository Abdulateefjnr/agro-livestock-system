const jwt = require('jsonwebtoken')
const Farm = require('../models/farm')
const User = require('../models/user')

const authenticate = async (req, res, next) => {
  const authorization = req.get('authorization')
  const [scheme, token] = authorization?.split(' ') || []

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication is required' })
  }

  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not configured')
    return res.status(500).json({ message: 'Authentication is unavailable' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)

    if (typeof payload !== 'object' || typeof payload.userId !== 'string') {
      return res.status(401).json({ message: 'Invalid authentication token' })
    }

    const user = await User.findById(payload.userId)
      .select('_id role isActive status email assignedFarmIds farmAssignmentsConfigured sessionVersion')

    if (
      !user ||
      user.isActive === false ||
      ['pending', 'inactive', 'suspended'].includes(user.status) ||
      (payload.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)
    ) {
      return res.status(401).json({ message: 'This account is unavailable. Please sign in again.' })
    }

    if (!user.farmAssignmentsConfigured && user.role !== 'admin') {
      user.assignedFarmIds = await Farm.distinct('_id', { userId: user._id })
      user.farmAssignmentsConfigured = true
      await user.save()
    }

    req.userId = String(user._id)
    req.userRole = user.role
    req.assignedFarmIds = (user.assignedFarmIds ?? []).map(String)
    next()
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Your session has expired. Please sign in again.' })
    }

    console.error('Unable to authenticate request:', error)
    return res.status(500).json({ message: 'Authentication is unavailable' })
  }
}

module.exports = authenticate
