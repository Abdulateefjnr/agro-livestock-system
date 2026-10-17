const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const fs = require('fs/promises')
const { isValidId } = require('../database')
const nodemailer = require('nodemailer')
const path = require('path')
const Activity = require('../models/activity')
const Farm = require('../models/farm')
const User = require('../models/user')
const logActivity = require('../utils/audit')
const createFrontendUrl = require('../utils/frontendUrl')

const roles = ['admin', 'manager', 'livestock_officer', 'crop_officer', 'accountant', 'staff']
const statuses = ['active', 'inactive', 'pending', 'suspended']
const safeUserFields =
  '_id fullName email phone role assignedFarmIds farmAssignmentsConfigured profilePicture status isActive createdAt lastLoginAt'
const profileDirectory = require('../utils/profileDirectory')

const isConfiguredAdmin = (email) =>
  Boolean(process.env.ADMIN_EMAIL) &&
  email === process.env.ADMIN_EMAIL.trim().toLowerCase()

const getStatus = (user) => {
  if (user.status === 'pending' || user.status === 'suspended') return user.status
  if (user.isActive === false) return 'inactive'
  return statuses.includes(user.status) ? user.status : 'active'
}

const serializeUser = (user) => ({
  id: String(user._id),
  fullName: user.fullName,
  email: user.email,
  phone: user.phone ?? '',
  role: roles.includes(user.role) ? user.role : 'staff',
  assignedFarmIds: (user.assignedFarmIds ?? []).map(String),
  profilePicture: user.profilePicture ?? '',
  status: getStatus(user),
  isActive: getStatus(user) === 'active',
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt ?? null
})

const validateFarmAssignments = async (farmIds) => {
  if (!Array.isArray(farmIds) || farmIds.some((id) => !isValidId(id))) {
    return false
  }
  const uniqueIds = [...new Set(farmIds.map(String))]
  if (!uniqueIds.length) return true
  const count = await Farm.countDocuments({ _id: { $in: uniqueIds } })
  return count === uniqueIds.length
}

const createMailTransport = () => {
  const requiredSettings = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS']
  const missingSettings = requiredSettings.filter((setting) => !process.env[setting])
  if (missingSettings.length) {
    throw new Error(`Missing email configuration: ${missingSettings.join(', ')}`)
  }
  const port = Number(process.env.EMAIL_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('EMAIL_PORT must be a valid port number')
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port,
    secure: process.env.EMAIL_SECURE
      ? process.env.EMAIL_SECURE.toLowerCase() === 'true'
      : port === 465,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  })
}

const sendInvitationEmail = async (user, token) => {
  const invitationUrl = createFrontendUrl('reset-password')
  invitationUrl.searchParams.set('token', token)
  const transporter = createMailTransport()
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: user.email,
    subject: 'You are invited to Agro Livestock',
    text: `Hello ${user.fullName}, an administrator invited you to Agro Livestock. Set your password and activate your account using this link. It expires in one hour: ${invitationUrl}`,
    html: `<div style="font-family:Arial,sans-serif;color:#26342a;max-width:560px"><h2>You are invited to Agro Livestock</h2><p>Hello ${user.fullName.replace(/[&<>"]/g, '')}, an administrator invited you to join the farm workspace.</p><p><a href="${invitationUrl}" style="display:inline-block;padding:12px 18px;background:#2f6b3f;color:white;text-decoration:none;border-radius:6px">Set password and activate account</a></p><p>This single-use link expires in one hour.</p></div>`
  })
}

const removeStoredPicture = async (pictureUrl) => {
  const fileName = path.basename(pictureUrl)
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(fileName)) return
  try {
    await fs.unlink(path.join(profileDirectory, fileName))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

const getImageFromDataUrl = (imageData) => {
  if (typeof imageData !== 'string') return null
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(imageData)
  if (!match) return null
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) return null

  const signatures = {
    png: bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    jpeg: bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    webp:
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
  }
  if (!signatures[match[1]]) return null

  const extension = match[1] === 'jpeg' ? 'jpg' : match[1]
  return { bytes, extension }
}

const getTargetUser = async (req, res, id = req.params.id) => {
  if (id === 'me') id = req.userId
  if (!isValidId(id)) {
    res.status(400).json({ message: 'Invalid user ID' })
    return null
  }
  if (String(id) !== req.userId && req.userRole !== 'admin') {
    res.status(403).json({ message: 'You can only manage your own profile picture' })
    return null
  }
  const user = await User.findById(id).select(safeUserFields)
  if (!user) res.status(404).json({ message: 'User not found' })
  return user
}

const listUsers = async (req, res) => {
  try {
    const users = await User.find().select(safeUserFields).sort({ createdAt: -1 })
    await Promise.all(users.map(async (user) => {
      if (!user.farmAssignmentsConfigured && user.role !== 'admin') {
        user.assignedFarmIds = await Farm.distinct('_id', { userId: user._id })
        user.farmAssignmentsConfigured = true
        await user.save()
      }
    }))
    return res.json(users.map(serializeUser))
  } catch (error) {
    console.error('Unable to load users:', error)
    return res.status(500).json({ message: 'Unable to load users right now' })
  }
}

const createUser = async (req, res) => {
  const body = req.body ?? {}
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const role = body.role
  const assignedFarmIds = Array.isArray(body.assignedFarmIds) ? body.assignedFarmIds : []

  if (!fullName || !email || !roles.includes(role)) {
    return res.status(400).json({ message: 'Name, valid email, and role are required' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address' })
  }
  if (
    phone &&
    (!/^\+?[0-9\s().-]{7,30}$/.test(phone) ||
      phone.replace(/\D/g, '').length < 7 ||
      phone.replace(/\D/g, '').length > 15)
  ) {
    return res.status(400).json({ message: 'Enter a valid phone number' })
  }
  if (isConfiguredAdmin(email) && role !== 'admin') {
    return res.status(400).json({ message: 'The configured administrator account must keep the administrator role' })
  }

  let user
  try {
    if (!(await validateFarmAssignments(assignedFarmIds))) {
      return res.status(400).json({ message: 'Select valid farms for this account' })
    }
    const invitationToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(invitationToken).digest('hex')
    user = await User.create({
      fullName,
      email,
      phone,
      role,
      assignedFarmIds: [...new Set(assignedFarmIds.map(String))],
      farmAssignmentsConfigured: true,
      password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      status: 'pending',
      isActive: false,
      passwordResetToken: tokenHash,
      passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000)
    })
    await sendInvitationEmail(user, invitationToken)
    await logActivity({
      actorId: req.userId,
      targetUserId: user._id,
      action: 'invited',
      entityType: 'user',
      entityId: user._id,
      details: `Invited ${user.email} as ${user.role}`
    })
    return res.status(201).json(serializeUser(user))
  } catch (error) {
    if (user) {
      try {
        await User.deleteOne({ _id: user._id })
      } catch (cleanupError) {
        console.error('Unable to remove account after invitation failure:', cleanupError)
      }
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists' })
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message })
    }
    console.error('Unable to invite user:', error)
    return res.status(500).json({
      message: error.message.startsWith('Missing email configuration:')
        ? 'User invitation email is not configured. No account was created.'
        : 'Unable to send the user invitation right now. Check the account list before trying again.'
    })
  }
}

const resendInvitation = async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user ID' })
  }
  let user
  let previousToken
  let previousExpiry
  try {
    user = await User.findById(req.params.id)
      .select('+passwordResetToken +passwordResetExpires')
    if (!user) return res.status(404).json({ message: 'User not found' })
    if (getStatus(user) !== 'pending') {
      return res.status(409).json({ message: 'Only pending accounts can receive a new invitation' })
    }
    previousToken = user.passwordResetToken
    previousExpiry = user.passwordResetExpires
    const token = crypto.randomBytes(32).toString('hex')
    user.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex')
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000)
    await user.save()
    await sendInvitationEmail(user, token)
    await logActivity({
      actorId: req.userId,
      targetUserId: user._id,
      action: 'invitation_resent',
      entityType: 'user',
      entityId: user._id
    })
    return res.json({ message: 'Invitation email sent' })
  } catch (error) {
    if (user) {
      user.passwordResetToken = previousToken
      user.passwordResetExpires = previousExpiry
      try {
        await user.save()
      } catch (restoreError) {
        console.error('Unable to restore invitation after email failure:', restoreError)
      }
    }
    console.error('Unable to resend user invitation:', error)
    return res.status(500).json({ message: 'Unable to resend the invitation right now' })
  }
}

const updateUser = async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user ID' })
  }

  const body = req.body ?? {}
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : undefined
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined
  const phone = typeof body.phone === 'string' ? body.phone.trim() : undefined
  const role = body.role
  const status = body.status ?? (typeof body.isActive === 'boolean' ? (body.isActive ? 'active' : 'inactive') : undefined)
  const assignedFarmIds = body.assignedFarmIds

  if (fullName !== undefined && !fullName) {
    return res.status(400).json({ message: 'Name cannot be empty' })
  }
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address' })
  }
  if (phone !== undefined && phone && (!/^\+?[0-9\s().-]{7,30}$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15)) {
    return res.status(400).json({ message: 'Enter a valid phone number' })
  }
  if (role !== undefined && !roles.includes(role)) {
    return res.status(400).json({ message: 'Select a valid user role' })
  }
  if (status !== undefined && !statuses.filter((value) => value !== 'pending').includes(status)) {
    return res.status(400).json({ message: 'Select a valid account status' })
  }
  try {
    if (assignedFarmIds !== undefined && !(await validateFarmAssignments(assignedFarmIds))) {
      return res.status(400).json({ message: 'Select valid farms for this account' })
    }
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    const isSelf = String(user._id) === req.userId
    const previousRole = user.role
    const previousStatus = getStatus(user)
    const previousAssignedFarmIds = (user.assignedFarmIds ?? []).map(String).sort()
    const nextEmail = email ?? user.email
    const nextRole = role ?? user.role ?? 'staff'
    const nextStatus = status ?? previousStatus

    if (isConfiguredAdmin(user.email) && (nextEmail !== user.email || nextRole !== 'admin' || nextStatus !== 'active')) {
      return res.status(400).json({ message: 'The configured administrator account cannot be renamed, demoted, or deactivated here' })
    }
    if (isConfiguredAdmin(nextEmail) && nextRole !== 'admin') {
      return res.status(400).json({ message: 'The configured administrator account must keep the administrator role' })
    }
    if (isSelf && (nextRole !== 'admin' || nextStatus !== 'active')) {
      return res.status(400).json({ message: 'You cannot remove administrator access or deactivate your own account' })
    }
    if (user.role === 'admin' && (nextRole !== 'admin' || nextStatus !== 'active')) {
      const activeAdminCount = await User.countDocuments({
        role: 'admin',
        isActive: { $ne: false },
        status: { $nin: ['inactive', 'pending', 'suspended'] }
      })
      if (activeAdminCount <= 1) {
        return res.status(409).json({ message: 'At least one active administrator must remain' })
      }
    }

    if (fullName !== undefined) user.fullName = fullName
    if (email !== undefined) user.email = email
    if (phone !== undefined) user.phone = phone
    if (role !== undefined) user.role = role
    if (assignedFarmIds !== undefined) {
      user.assignedFarmIds = [...new Set(assignedFarmIds.map(String))]
      user.farmAssignmentsConfigured = true
    }
    if (status !== undefined) {
      user.status = status
      user.isActive = status === 'active'
    }

    const changedPermissions =
      previousRole !== user.role ||
      previousStatus !== getStatus(user) ||
      (assignedFarmIds !== undefined &&
        JSON.stringify(previousAssignedFarmIds) !==
          JSON.stringify([...new Set(assignedFarmIds.map(String))].sort()))
    if (changedPermissions) user.sessionVersion = (user.sessionVersion ?? 0) + 1

    await user.save()
    if (changedPermissions) {
      await logActivity({
        actorId: req.userId,
        targetUserId: user._id,
        action: 'permissions_changed',
        entityType: 'user',
        entityId: user._id,
        details: `Role/status/access changed from ${previousRole}/${previousStatus}`
      })
    } else {
      await logActivity({
        actorId: req.userId,
        targetUserId: user._id,
        action: 'profile_updated',
        entityType: 'user',
        entityId: user._id
      })
    }
    return res.json(serializeUser(user))
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists' })
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message })
    }
    console.error('Unable to update user:', error)
    return res.status(500).json({ message: 'Unable to update user right now' })
  }
}

const uploadProfilePicture = async (req, res) => {
  let user
  let uploadedPath
  try {
    user = await getTargetUser(req, res, req.params.id ?? 'me')
    if (!user) return
    const image = getImageFromDataUrl(req.body?.imageData)
    if (!image) {
      return res.status(400).json({ message: 'Choose a valid PNG, JPEG, or WebP image up to 2 MB' })
    }

    const fileName = `${crypto.randomUUID()}.${image.extension}`
    await fs.mkdir(profileDirectory, { recursive: true })
    uploadedPath = path.join(profileDirectory, fileName)
    await fs.writeFile(uploadedPath, image.bytes, { flag: 'wx' })
    const previousPicture = user.profilePicture
    user.profilePicture = `/profile-pictures/${fileName}`
    await user.save()
    uploadedPath = undefined
    if (previousPicture) {
      try {
        await removeStoredPicture(previousPicture)
      } catch (cleanupError) {
        console.error('Unable to remove replaced profile picture:', cleanupError)
      }
    }
    await logActivity({
      actorId: req.userId,
      targetUserId: user._id,
      action: 'profile_picture_updated',
      entityType: 'user',
      entityId: user._id
    })
    return res.json(serializeUser(user))
  } catch (error) {
    if (uploadedPath) {
      try {
        await fs.unlink(uploadedPath)
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') console.error('Unable to clean up failed profile upload:', cleanupError)
      }
    }
    console.error('Unable to save profile picture:', error)
    return res.status(500).json({ message: 'Unable to save the profile picture right now' })
  }
}

const removeProfilePicture = async (req, res) => {
  try {
    const user = await getTargetUser(req, res, req.params.id ?? 'me')
    if (!user) return
    const previousPicture = user.profilePicture
    user.profilePicture = ''
    await user.save()
    if (previousPicture) {
      try {
        await removeStoredPicture(previousPicture)
      } catch (cleanupError) {
        console.error('Unable to remove profile picture file:', cleanupError)
      }
    }
    await logActivity({
      actorId: req.userId,
      targetUserId: user._id,
      action: 'profile_picture_removed',
      entityType: 'user',
      entityId: user._id
    })
    return res.json(serializeUser(user))
  } catch (error) {
    console.error('Unable to remove profile picture:', error)
    return res.status(500).json({ message: 'Unable to remove the profile picture right now' })
  }
}

const revokeSessions = async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user ID' })
  }
  try {
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })
    user.sessionVersion = (user.sessionVersion ?? 0) + 1
    await user.save()
    await logActivity({
      actorId: req.userId,
      targetUserId: user._id,
      action: 'sessions_revoked',
      entityType: 'user',
      entityId: user._id
    })
    return res.json({ message: 'All sessions for this account have been revoked' })
  } catch (error) {
    console.error('Unable to revoke user sessions:', error)
    return res.status(500).json({ message: 'Unable to revoke sessions right now' })
  }
}

const listActivity = async (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 100)
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 100
  try {
    const activity = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actorId', 'fullName email')
      .populate('targetUserId', 'fullName email')
      .lean()
    return res.json(activity.map((entry) => ({
      id: String(entry._id),
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: entry.details,
      createdAt: entry.createdAt,
      actor: entry.actorId
        ? { id: String(entry.actorId._id), fullName: entry.actorId.fullName, email: entry.actorId.email }
        : null,
      targetUser: entry.targetUserId
        ? { id: String(entry.targetUserId._id), fullName: entry.targetUserId.fullName, email: entry.targetUserId.email }
        : null
    })))
  } catch (error) {
    console.error('Unable to load user activity:', error)
    return res.status(500).json({ message: 'Unable to load activity right now' })
  }
}

module.exports = {
  createUser,
  listActivity,
  listUsers,
  removeProfilePicture,
  resendInvitation,
  revokeSessions,
  updateUser,
  uploadProfilePicture
}
