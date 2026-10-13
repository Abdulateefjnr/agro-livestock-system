const express = require('express')
const authenticate = require('../middleware/authmiddleware')
const requireRole = require('../middleware/requireRole')
const {
  createUser,
  listActivity,
  listUsers,
  removeProfilePicture,
  resendInvitation,
  revokeSessions,
  updateUser,
  uploadProfilePicture
} = require('../controllers/usercontroller')

const router = express.Router()

router.use(authenticate)
router.patch('/me/profile-picture', uploadProfilePicture)
router.delete('/me/profile-picture', removeProfilePicture)
router.use(requireRole('admin'))
router.get('/activity', listActivity)
router.route('/').get(listUsers).post(createUser)
router.post('/:id/invitation', resendInvitation)
router.post('/:id/revoke-sessions', revokeSessions)
router.patch('/:id/profile-picture', uploadProfilePicture)
router.delete('/:id/profile-picture', removeProfilePicture)
router.patch('/:id', updateUser)

module.exports = router
