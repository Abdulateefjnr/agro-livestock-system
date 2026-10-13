const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.userRole || !allowedRoles.includes(req.userRole)) {
    return res.status(403).json({ message: 'You do not have permission to perform this action' })
  }

  next()
}

module.exports = requireRole
