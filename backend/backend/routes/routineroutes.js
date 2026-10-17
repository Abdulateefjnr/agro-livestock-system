const express = require('express')
const authenticate = require('../middleware/authmiddleware')
const requireRole = require('../middleware/requireRole')
const writeRoutine = requireRole('admin', 'manager', 'livestock_officer', 'crop_officer')
const {
  createRoutine,
  deleteRoutine,
  listRoutines,
  updateRoutine
} = require('../controllers/routinecontroller')

const router = express.Router()

router.use(authenticate)
router.route('/').get(listRoutines).post(writeRoutine, createRoutine)
router.route('/:id').patch(writeRoutine, updateRoutine).delete(writeRoutine, deleteRoutine)

module.exports = router
